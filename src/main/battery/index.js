'use strict';

const demo = require('./demo');
const hid = require('./hid');

function provider(platform = process.platform) {
  if (platform === 'win32') return require('./windows');
  if (platform === 'darwin') return require('./mac');
  return require('./linux');
}

const ORDER = ['mouse', 'keyboard', 'headset', 'controller', 'speaker', 'pen', 'phone', 'watch', 'other', 'system'];

function sortDevices(list) {
  return list.slice().sort((a, b) => {
    const t = ORDER.indexOf(a.type) - ORDER.indexOf(b.type);
    return t !== 0 ? t : a.name.localeCompare(b.name, 'de');
  });
}

// Gleiche Geräte aus zwei Quellen (z. B. UPower und USB) nur einmal zeigen;
// der Eintrag aus der ersten Liste gewinnt.
function mergeDevices(...lists) {
  const out = [];
  const names = new Set();
  const ids = new Set();
  for (const list of lists) {
    for (const d of list) {
      const key = d.name.toLowerCase().replace(/^logitech\s+/, '');
      if (ids.has(d.id) || (d.type !== 'system' && names.has(key))) continue;
      ids.add(d.id);
      names.add(key);
      out.push(d);
    }
  }
  return out;
}

// Liefert { devices, receivers, error } – Fehler werden nie geworfen, damit
// das Widget auch bei Problemen weiterläuft.
async function readDevices({ demo: useDemo = false, hidModule } = {}) {
  if (useDemo) {
    const list = await demo.getDevices();
    return { devices: sortDevices(list), receivers: demo.receivers(), error: null, at: Date.now() };
  }
  const [sys, usb] = await Promise.all([
    provider()
      .getDevices()
      .then((devices) => ({ devices, error: null }))
      .catch((err) => ({ devices: [], error: err && err.message ? err.message : String(err) })),
    hid
      .getDevices(hidModule ? { hid: hidModule } : undefined)
      .catch((err) => ({ devices: [], notes: [], error: err && err.message ? err.message : String(err) })),
  ]);
  const devices = sortDevices(mergeDevices(usb.devices, sys.devices));
  // Ein Fehler wird nur gezeigt, wenn gar nichts gefunden wurde.
  const error = devices.length ? null : sys.error || usb.error || null;
  return { devices, receivers: usb.notes || [], error, at: Date.now() };
}

module.exports = { readDevices, sortDevices, mergeDevices, provider };
