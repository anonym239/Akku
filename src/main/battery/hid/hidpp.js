'use strict';

// Logitech HID++ 2.0: liest den Akkustand von Mäusen und Tastaturen, die über
// einen Unifying-, Bolt- oder Lightspeed-Empfänger verbunden sind (oder
// direkt per USB-Kabel stecken). Das Protokoll ist öffentlich dokumentiert
// und wird u. a. von Solaar verwendet.

const SHORT = 0x10;
const LONG = 0x11;
const SHORT_LEN = 7;
const LONG_LEN = 20;
const SW_ID = 0x0b;

const FEATURE = {
  ROOT: 0x0000,
  DEVICE_NAME: 0x0005,
  BATTERY_STATUS: 0x1000,
  BATTERY_VOLTAGE: 0x1001,
  UNIFIED_BATTERY: 0x1004,
  ADC_MEASUREMENT: 0x1f20,
};

// Gerätetyp laut Feature 0x0005 (getDeviceType)
const DEVICE_TYPES = {
  0: 'keyboard',
  1: 'other',
  2: 'keyboard',
  3: 'mouse',
  4: 'mouse',
  5: 'mouse',
  6: 'other',
  7: 'receiver',
  8: 'headset',
  9: 'other',
  10: 'controller',
  11: 'controller',
  12: 'controller',
  14: 'speaker',
};

// Entladekurve eines Li-Ionen-Akkus (mV → %), für Geräte, die nur die Spannung melden.
const VOLTAGE_CURVE = [
  [4200, 100], [4100, 90], [4000, 80], [3920, 70], [3870, 60], [3830, 50],
  [3790, 40], [3750, 30], [3710, 20], [3670, 10], [3600, 5], [3500, 0],
];

function voltageToPercent(mv) {
  if (mv >= VOLTAGE_CURVE[0][0]) return 100;
  for (let i = 1; i < VOLTAGE_CURVE.length; i++) {
    const [v1, p1] = VOLTAGE_CURVE[i - 1];
    const [v2, p2] = VOLTAGE_CURVE[i];
    if (mv >= v2) return Math.round(p2 + ((mv - v2) / (v1 - v2)) * (p1 - p2));
  }
  return 0;
}

class HidppError extends Error {
  constructor(code, kind) {
    super(`HID++-Fehler ${code}`);
    this.code = code;
    this.kind = kind; // 'hidpp10' (Empfänger meldet z. B. "Gerät aus") oder 'hidpp20'
  }
}

// Kanal zu einem Empfänger/Gerät. Unter Windows gibt es getrennte
// HID-Sammlungen für kurze (0x10) und lange (0x11) Berichte.
class HidppChannel {
  constructor({ short, long }) {
    this.short = short || null;
    this.long = long || short;
    this.pending = new Set();
    const onData = (data) => this._onData(Buffer.from(data));
    for (const h of new Set([this.short, this.long].filter(Boolean))) h.on('data', onData);
  }

  _onData(buf) {
    for (const p of this.pending) {
      if (p.match(buf)) {
        this.pending.delete(p);
        p.resolve(buf);
        return;
      }
    }
  }

  // Sendet eine HID++-2.0-Anfrage und wartet auf die passende Antwort.
  request(devIdx, featIdx, func, params = [], timeoutMs = 1500) {
    const fs = ((func & 0x0f) << 4) | SW_ID;
    const msg = Buffer.alloc(LONG_LEN);
    msg[0] = LONG;
    msg[1] = devIdx;
    msg[2] = featIdx;
    msg[3] = fs;
    Buffer.from(params).copy(msg, 4, 0, LONG_LEN - 4);

    return new Promise((resolve, reject) => {
      const entry = {
        match: (b) => {
          if (b.length < 5 || b[1] !== devIdx) return false;
          if ((b[0] === LONG || b[0] === 0x12) && b[2] === featIdx && b[3] === fs) return true;
          if ((b[0] === LONG || b[0] === 0x12) && b[2] === 0xff && b[3] === featIdx && b[4] === fs) {
            entry.error = new HidppError(b[5], 'hidpp20');
            return true;
          }
          if (b[0] === SHORT && b[2] === 0x8f && b[3] === featIdx && b[4] === fs) {
            entry.error = new HidppError(b[5], 'hidpp10');
            return true;
          }
          return false;
        },
        resolve: (b) => {
          clearTimeout(timer);
          if (entry.error) reject(entry.error);
          else resolve(b.subarray(4));
        },
      };
      const timer = setTimeout(() => {
        this.pending.delete(entry);
        reject(new HidppError(-1, 'timeout'));
      }, timeoutMs);
      this.pending.add(entry);
      this.long.write([...msg]).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(entry);
        reject(err);
      });
    });
  }

  async close() {
    for (const h of new Set([this.short, this.long].filter(Boolean))) {
      try {
        await h.close();
      } catch {
        // schon geschlossen
      }
    }
  }
}

// Fragt ein einzelnes Gerät hinter dem Kanal ab.
class HidppDevice {
  constructor(channel, index) {
    this.ch = channel;
    this.index = index;
    this.features = new Map();
  }

  async ping() {
    const r = await this.ch.request(this.index, 0x00, 1, [0, 0, 0x5a], 1200);
    return { major: r[0], minor: r[1] };
  }

  async featureIndex(id) {
    if (this.features.has(id)) return this.features.get(id);
    const r = await this.ch.request(this.index, 0x00, 0, [id >> 8, id & 0xff]);
    const idx = r[0] || 0;
    this.features.set(id, idx);
    return idx;
  }

  async name() {
    const f = await this.featureIndex(FEATURE.DEVICE_NAME);
    if (!f) return { name: null, type: null };
    const len = (await this.ch.request(this.index, f, 0))[0];
    let name = '';
    while (name.length < len && name.length < 64) {
      const chunk = await this.ch.request(this.index, f, 1, [name.length]);
      const part = chunk.subarray(0, len - name.length).toString('latin1').replace(/\0+$/, '');
      if (!part) break;
      name += part;
    }
    let type = null;
    try {
      type = DEVICE_TYPES[(await this.ch.request(this.index, f, 2))[0]] || 'other';
    } catch {
      // ältere Geräte kennen getDeviceType nicht
    }
    return { name: name.trim() || null, type };
  }

  async battery() {
    let f = await this.featureIndex(FEATURE.UNIFIED_BATTERY);
    if (f) {
      const caps = await this.ch.request(this.index, f, 0);
      const s = await this.ch.request(this.index, f, 1);
      const hasPercent = (caps[1] & 0x02) === 0x02 || s[0] > 0;
      let level = s[0];
      if (!hasPercent) {
        const flags = s[1];
        level = flags & 0x08 ? 90 : flags & 0x04 ? 50 : flags & 0x02 ? 20 : flags & 0x01 ? 5 : 0;
      }
      return { level, charging: s[2] === 1 || s[2] === 2 || (s[2] === 3 && s[3] > 0), method: '0x1004' };
    }
    f = await this.featureIndex(FEATURE.BATTERY_STATUS);
    if (f) {
      const s = await this.ch.request(this.index, f, 0);
      return { level: s[0], charging: [1, 2, 4].includes(s[2]) || (s[2] === 3), method: '0x1000' };
    }
    f = await this.featureIndex(FEATURE.BATTERY_VOLTAGE);
    if (f) {
      const s = await this.ch.request(this.index, f, 0);
      return { level: voltageToPercent((s[0] << 8) | s[1]), charging: (s[2] & 0x80) === 0x80, method: '0x1001' };
    }
    f = await this.featureIndex(FEATURE.ADC_MEASUREMENT);
    if (f) {
      const s = await this.ch.request(this.index, f, 0);
      const mv = (s[0] << 8) | s[1];
      if (!mv) return null;
      return { level: voltageToPercent(mv), charging: (s[2] & 0x02) === 0x02, method: '0x1f20' };
    }
    return null;
  }
}

// Liest alle Geräte eines Empfängers (Index 1–6) bzw. ein direkt
// angeschlossenes Gerät (Index 0xFF).
async function readChannel(channel) {
  const results = [];
  const offline = [];

  async function probe(index) {
    const dev = new HidppDevice(channel, index);
    let proto;
    try {
      proto = await dev.ping();
    } catch (err) {
      // 0x09 = Gerät gekoppelt, aber ausgeschaltet oder außer Reichweite
      if (err.kind === 'hidpp10' && err.code === 0x09 && index !== 0xff) offline.push(index);
      return;
    }
    if (proto.major < 2) return;
    const info = await dev.name().catch(() => ({ name: null, type: null }));
    if (info.type === 'receiver') return;
    const bat = await dev.battery().catch(() => null);
    if (!bat) return;
    results.push({ index, name: info.name, type: info.type, ...bat, level: Math.max(0, Math.min(100, bat.level)) });
  }

  // Direkt angeschlossenes Gerät zuerst; antwortet es, ist es kein Empfänger.
  await probe(0xff);
  if (results.length === 0) {
    await Promise.all([1, 2, 3, 4, 5, 6].map(probe));
  }
  return { devices: results.sort((a, b) => a.index - b.index), offline };
}

module.exports = { HidppChannel, HidppDevice, HidppError, readChannel, voltageToPercent, FEATURE, SHORT_LEN, LONG_LEN };
