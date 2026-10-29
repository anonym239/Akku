'use strict';

const demo = require('./demo');

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

// Liefert { devices, error } – Fehler werden nie geworfen, damit das Widget
// auch bei Problemen weiterläuft.
async function readDevices({ demo: useDemo = false } = {}) {
  try {
    const list = useDemo ? await demo.getDevices() : await provider().getDevices();
    return { devices: sortDevices(list), error: null, at: Date.now() };
  } catch (err) {
    return { devices: [], error: err && err.message ? err.message : String(err), at: Date.now() };
  }
}

module.exports = { readDevices, sortDevices, provider };
