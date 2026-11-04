'use strict';

// Nachgebaute USB-Geräte für die Tests (Logitech-Empfänger, Razer-Dongle).
const { EventEmitter } = require('events');

class Handle extends EventEmitter {
  constructor(hw, collection) {
    super();
    this.hw = hw;
    this.collection = collection;
    this.closed = false;
  }
  async write(data) {
    if (this.closed) throw new Error('geschlossen');
    if (this.hw.onWrite) this.hw.onWrite(this, Buffer.from(data));
    return data.length;
  }
  async sendFeatureReport(data) {
    this.hw.lastFeature = Buffer.from(data);
    return data.length;
  }
  async getFeatureReport(id, len) {
    return this.hw.onFeature(this, this.hw.lastFeature, len);
  }
  async close() {
    this.closed = true;
  }
}

// Logitech-Empfänger im Windows-Stil: kurze und lange Berichte in getrennten Sammlungen.
function logitechReceiver({ pid = 0xc548, product = 'USB Receiver', devices = {}, offline = [] }) {
  const handles = {};
  const hw = {
    onWrite(handle, b) {
      const [, idx, feat, fs] = b;
      const func = fs >> 4;
      const p = b.subarray(4);
      const reply = (params) => {
        const r = Buffer.alloc(20);
        r[0] = 0x11; r[1] = idx; r[2] = feat; r[3] = fs;
        Buffer.from(params).copy(r, 4);
        setImmediate(() => handles.long.emit('data', r));
      };
      const err10 = (code) => setImmediate(() => handles.short.emit('data', Buffer.from([0x10, idx, 0x8f, feat, fs, code, 0])));
      if (idx === 0xff) return err10(0x01);
      if (offline.includes(idx)) return err10(0x09);
      const dev = devices[idx];
      if (!dev) return err10(0x08);
      const featIds = Object.keys(dev.features).map(Number);
      const featOf = (index) => featIds.find((id) => dev.features[id] === index);
      if (feat === 0) {
        if (func === 1) return reply([4, 2, p[2]]);
        if (func === 0) return reply([dev.features[(p[0] << 8) | p[1]] || 0]);
      }
      const id = featOf(feat);
      if (id === 0x0005) {
        if (func === 0) return reply([dev.name.length]);
        if (func === 1) return reply([...Buffer.from(dev.name.slice(p[0], p[0] + 16), 'latin1')]);
        if (func === 2) return reply([dev.type]);
      }
      if (id === 0x1004) {
        if (func === 0) return reply([0x0f, dev.percent === false ? 0 : 0x02]);
        if (func === 1) return reply(dev.unified);
      }
      if (id === 0x1001 && func === 0) return reply(dev.voltage);
      if (id === 0x1000 && func === 0) return reply(dev.status);
      setImmediate(() => handles.long.emit('data', Buffer.from([0x11, idx, 0xff, feat, fs, 0x02, ...Array(14).fill(0)])));
    },
  };
  const info = (usage) => ({ vendorId: 0x046d, productId: pid, product, manufacturer: 'Logitech', interface: 2, usagePage: 0xff00, usage, path: `logi-${pid}-${usage}` });
  const list = [
    { vendorId: 0x046d, productId: pid, product, manufacturer: 'Logitech', interface: 0, usagePage: 1, usage: 6, path: `logi-${pid}-kbd` },
    info(1),
    info(2),
  ];
  return { list, hw, handles, open: (path) => {
    const h = new Handle(hw, path);
    if (path.endsWith('-1')) handles.short = h;
    if (path.endsWith('-2')) handles.long = h;
    return h;
  } };
}

function razerDongle({ pid = 0x007b, product = 'Razer Viper Ultimate Dongle', tid = 0x1f, level = 204, charging = 0 }) {
  const hw = {
    onFeature(_h, req, len) {
      const r = Buffer.alloc(len);
      const body = req.subarray(1);
      if (body[1] !== tid) { r[1] = 0x05; return r; }
      r[1] = 0x02; // OK (Byte 0 ist die Report-ID)
      r[2] = tid; r[7] = body[6]; r[8] = body[7];
      if (body[7] === 0x80) r[10] = level;
      if (body[7] === 0x84) r[10] = charging;
      return r;
    },
  };
  const list = [
    { vendorId: 0x1532, productId: pid, product, manufacturer: 'Razer', interface: 0, usagePage: 1, usage: 2, path: `razer-${pid}-0` },
  ];
  return { list, hw, open: (path) => new Handle(hw, path) };
}

function mockHid(...parts) {
  const extra = parts.filter((p) => !p.open);
  const real = parts.filter((p) => p.open);
  return {
    async devicesAsync() {
      return [...real.flatMap((p) => p.list), ...extra.flatMap((p) => p.list)];
    },
    HIDAsync: {
      async open(path) {
        const owner = real.find((p) => p.list.some((d) => d.path === path));
        if (!owner) throw new Error('kein Zugriff');
        return owner.open(path);
      },
    },
  };
}

module.exports = { mockHid, logitechReceiver, razerDongle };
