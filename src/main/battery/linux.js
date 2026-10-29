'use strict';

const { execFile } = require('child_process');
const { classify } = require('./classify');

// UPower kennt den Akkustand von Bluetooth- und vielen Funk-Geräten
// (z. B. Logitech Unifying/Bolt über den Kernel-Treiber hid-logitech).
const UPOWER_TYPES = {
  mouse: 'mouse',
  keyboard: 'keyboard',
  touchpad: 'mouse',
  tablet: 'pen',
  pen: 'pen',
  'gaming-input': 'controller',
  headset: 'headset',
  headphones: 'headset',
  speakers: 'speaker',
  phone: 'phone',
  battery: 'system',
  'bluetooth-generic': 'other',
  'other-audio': 'headset',
  wearable: 'watch',
};

function parseUpower(stdout) {
  const blocks = String(stdout || '').split(/\n(?=Device: )/);
  const devices = [];
  for (const block of blocks) {
    const path = (block.match(/^Device:\s*(\S+)/m) || [])[1];
    if (!path || /DisplayDevice$/.test(path) || /line_power/.test(path)) continue;

    const field = (k) => {
      const m = block.match(new RegExp('^\\s+' + k + ':\\s*(.+)$', 'm'));
      return m ? m[1].trim() : undefined;
    };
    const kind = (block.match(/^ {2}([a-z][a-z-]*)\s*$/m) || [])[1];
    if (!kind || kind === 'line-power' || kind === 'ups' || kind === 'monitor') continue;
    if (field('present') === 'no') continue;

    const pct = parseFloat(field('percentage'));
    if (!Number.isFinite(pct)) continue;

    const state = field('state') || '';
    const type = UPOWER_TYPES[kind] || classify(field('model'));
    const isSystem = type === 'system' && field('power supply') !== 'no';
    if (type === 'system' && !isSystem) continue;

    const model = field('model') || '';
    devices.push({
      id: 'upower-' + path.split('/').pop(),
      name: isSystem ? 'Dieser PC' : model || 'Gerät',
      type: isSystem ? 'system' : classify(model, type),
      level: Math.round(Math.max(0, Math.min(100, pct))),
      charging: /^(charging|fully-charged|pending-charge)$/.test(state),
      connected: field('online') !== 'no',
      source: isSystem ? 'System' : 'UPower',
    });
  }
  return devices;
}

function getDevices() {
  return new Promise((resolve, reject) => {
    execFile('upower', ['--dump'], { timeout: 10000 }, (err, stdout) => {
      if (err) return reject(new Error('UPower ist nicht verfügbar (Paket "upower" installieren).'));
      resolve(parseUpower(stdout));
    });
  });
}

module.exports = { getDevices, parseUpower };
