'use strict';

// Akkustand von Geräten mit eigenem USB-Empfänger (2,4 GHz-Funk), die
// Windows selbst nicht kennt. Unterstützt: Logitech (Unifying, Bolt,
// Lightspeed, auch per Kabel) und Razer (HyperSpeed-Dongles, kabellose Mäuse).
// Alle anderen Empfänger werden erkannt und mit Hinweis aufgelistet.

const { classify } = require('../classify');
const { HidppChannel, readChannel } = require('./hidpp');
const { readRazer } = require('./razer');

const VENDORS = {
  0x046d: 'Logitech',
  0x1532: 'Razer',
  0x1038: 'SteelSeries',
  0x1b1c: 'Corsair',
  0x0951: 'HyperX',
  0x03f0: 'HyperX',
  0x258a: 'Glorious',
  0x3554: 'Pulsar',
  0x093a: 'Pixart',
  0x1ea7: 'SHARKOON',
  0x248a: 'Maxxter',
  0x25a7: 'Areson',
  0x3151: 'Cooler Master',
  0x2ea8: 'Endgame Gear',
  0x0b05: 'ASUS ROG',
  0x1e7d: 'ROCCAT',
  0x320f: 'Keychron',
  0x3434: 'Keychron',
  0x05ac: 'Apple',
  0x045e: 'Microsoft',
  0x413c: 'Dell',
  0x17ef: 'Lenovo',
  0x04f2: 'Chicony',
  0x1a2c: 'China Resource Semico',
};

const RECEIVER_RE = /receiver|empf[äa]nger|dongle|wireless|2\.4\s?g|nano|unifying|bolt|lightspeed|hyperspeed|slipstream|quantum|usb\s?rf|rf\s?(mouse|keyboard)/i;

// Bekannte Logitech-Empfänger (Produkt-IDs)
const LOGI_RECEIVERS = new Set([0xc52b, 0xc532, 0xc534, 0xc539, 0xc53a, 0xc53d, 0xc53f, 0xc541, 0xc545, 0xc547, 0xc548, 0xc52f, 0xc531, 0xc517, 0xc51a, 0xc51b, 0xc521, 0xc525, 0xc526]);

// Letzter bekannter Stand je Gerät, damit ausgeschaltete Geräte mit
// "Getrennt" weiter angezeigt werden.
const lastKnown = new Map();
const razerTid = new Map();

let hidModule;
function loadHid() {
  if (hidModule === undefined) {
    try {
      hidModule = require('node-hid');
    } catch (err) {
      hidModule = null;
      console.error('node-hid nicht verfügbar:', err.message);
    }
  }
  return hidModule;
}

function hex(n) {
  return n.toString(16).padStart(4, '0');
}

function cleanName(name) {
  return String(name || '')
    .replace(/\s*\((wireless|dongle|receiver)\)/gi, '')
    .replace(/\s+(dongle|receiver|wireless receiver|usb receiver)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fasst HID-Sammlungen eines physischen Geräts zusammen.
function groupDevices(list) {
  const groups = new Map();
  for (const d of list) {
    const key = `${hex(d.vendorId)}:${hex(d.productId)}:${d.serialNumber || ''}:${d.interface}`;
    if (!groups.has(key)) groups.set(key, { vendorId: d.vendorId, productId: d.productId, product: d.product, manufacturer: d.manufacturer, interface: d.interface, items: [] });
    groups.get(key).items.push(d);
  }
  return [...groups.values()];
}

function logiCollections(group) {
  const vendorItems = group.items.filter((d) => (d.usagePage & 0xff00) === 0xff00);
  if (vendorItems.length === 0) return null;
  const short = vendorItems.find((d) => d.usage === 1);
  const long = vendorItems.find((d) => d.usage === 2);
  // Unter Linux/macOS gibt es nur eine Sammlung für alle Berichtsarten.
  return { short: short || vendorItems[0], long: long || vendorItems[0] };
}

async function open(hid, path) {
  return hid.HIDAsync.open(path, { nonExclusive: true });
}

async function readLogitech(hid, groups) {
  const devices = [];
  const notes = [];
  // Pro Empfänger/Gerät gibt es eine Schnittstelle mit Hersteller-Sammlung.
  for (const group of groups) {
    const cols = logiCollections(group);
    if (!cols) continue;
    const base = `logi-${hex(group.productId)}`;
    const isReceiver = LOGI_RECEIVERS.has(group.productId) || RECEIVER_RE.test(group.product || '');
    let channel;
    try {
      const shortH = await open(hid, cols.short.path);
      const longH = cols.long.path === cols.short.path ? shortH : await open(hid, cols.long.path);
      channel = new HidppChannel({ short: shortH, long: longH });
      const { devices: found, offline } = await readChannel(channel);
      for (const f of found) {
        const id = `${base}-${f.index}`;
        const name = f.name ? `${/^logi|^mx|^g\d|^g pro|^pop|^lift|^ergo|^k\d|^m\d/i.test(f.name) ? '' : 'Logitech '}${f.name}` : 'Logitech-Gerät';
        const dev = {
          id,
          name,
          type: f.type && f.type !== 'other' ? f.type : classify(name),
          level: f.level,
          charging: f.charging,
          connected: true,
          source: f.index === 0xff ? 'USB (Logitech)' : 'USB-Empfänger (Logitech)',
        };
        lastKnown.set(id, dev);
        devices.push(dev);
      }
      for (const idx of offline) {
        const prev = lastKnown.get(`${base}-${idx}`);
        if (prev) devices.push({ ...prev, connected: false, charging: false });
      }
      notes.push({
        id: base,
        name: cleanName(group.product) || 'Logitech-Empfänger',
        vendor: 'Logitech',
        kind: isReceiver ? 'receiver' : 'device',
        status: found.length ? 'ok' : offline.length ? 'offline' : 'empty',
        count: found.length,
      });
    } catch (err) {
      notes.push({ id: base, name: cleanName(group.product) || 'Logitech-Gerät', vendor: 'Logitech', kind: isReceiver ? 'receiver' : 'device', status: 'error', message: err.message });
    } finally {
      if (channel) await channel.close();
    }
  }
  return { devices, notes };
}

async function readRazerGroups(hid, groups) {
  // Alle Sammlungen eines Razer-Produkts nacheinander probieren.
  const byProduct = new Map();
  for (const g of groups) {
    const key = hex(g.productId);
    if (!byProduct.has(key)) byProduct.set(key, { product: g.product, productId: g.productId, items: [] });
    byProduct.get(key).items.push(...g.items);
  }
  const devices = [];
  const notes = [];
  for (const [key, p] of byProduct) {
    const id = `razer-${key}`;
    const name = cleanName(p.product) || 'Razer-Gerät';
    let result = null;
    for (const item of p.items) {
      let h;
      try {
        h = await open(hid, item.path);
        result = await readRazer(h, razerTid.get(key));
      } catch {
        result = null;
      } finally {
        if (h) await h.close().catch(() => {});
      }
      if (result) break;
    }
    if (result && !result.sleeping) {
      razerTid.set(key, result.tid);
      const dev = { id, name, type: classify(name), level: result.level, charging: result.charging, connected: true, source: 'USB-Empfänger (Razer)' };
      lastKnown.set(id, dev);
      devices.push(dev);
      notes.push({ id, name, vendor: 'Razer', kind: 'receiver', status: 'ok', count: 1 });
    } else if (result && result.sleeping) {
      const prev = lastKnown.get(id);
      if (prev) devices.push({ ...prev, connected: false, charging: false });
      notes.push({ id, name, vendor: 'Razer', kind: 'receiver', status: 'offline' });
    } else if (RECEIVER_RE.test(p.product || '') || /pro|ultimate|hyperspeed|wireless/i.test(p.product || '')) {
      notes.push({ id, name, vendor: 'Razer', kind: 'receiver', status: 'empty' });
    }
  }
  return { devices, notes };
}

// Andere Funkempfänger: erkennen und melden, dass der Akku nicht lesbar ist.
function otherReceivers(groups) {
  const notes = [];
  const seen = new Set();
  for (const g of groups) {
    if (g.vendorId === 0x046d || g.vendorId === 0x1532) continue;
    const name = g.product || '';
    const vendor = VENDORS[g.vendorId] || g.manufacturer || 'Unbekannt';
    const isInput = g.items.some((d) => d.usagePage === 1 && (d.usage === 2 || d.usage === 6));
    if (!isInput) continue;
    if (!RECEIVER_RE.test(name) && !RECEIVER_RE.test(g.manufacturer || '') && !VENDORS[g.vendorId]) continue;
    const key = `${hex(g.vendorId)}:${hex(g.productId)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push({
      id: key,
      name: cleanName(name) || 'Funkempfänger',
      vendor,
      kind: RECEIVER_RE.test(name) ? 'receiver' : 'device',
      status: 'unsupported',
      vid: hex(g.vendorId),
      pid: hex(g.productId),
    });
  }
  return notes;
}

async function getDevices({ hid = loadHid() } = {}) {
  if (!hid) return { devices: [], notes: [], error: 'USB-Zugriff (node-hid) ist nicht verfügbar.' };
  const all = await hid.devicesAsync();
  const groups = groupDevices(all);
  const logi = await readLogitech(hid, groups.filter((g) => g.vendorId === 0x046d));
  const razer = await readRazerGroups(hid, groups.filter((g) => g.vendorId === 0x1532));
  return {
    devices: [...logi.devices, ...razer.devices],
    notes: [...logi.notes, ...razer.notes, ...otherReceivers(groups)],
    error: null,
  };
}

module.exports = { getDevices, groupDevices, cleanName, _lastKnown: lastKnown };
