'use strict';

const { execFile } = require('child_process');
const { classify } = require('./classify');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout));
  });
}

// ioreg listet Apple- und Bluetooth-HID-Geräte mit "BatteryPercent".
function parseIoreg(stdout) {
  const devices = [];
  const seen = new Set();
  for (const block of String(stdout || '').split(/\n(?=\+-o )/)) {
    const pct = (block.match(/"BatteryPercent"\s*=\s*(\d+)/) || [])[1];
    if (pct === undefined) continue;
    const name = (block.match(/"Product"\s*=\s*"([^"]+)"/) || [])[1] || 'Bluetooth-Gerät';
    const addr = (block.match(/"DeviceAddress"\s*=\s*"([^"]+)"/) || [])[1] || name;
    if (seen.has(addr)) continue;
    seen.add(addr);
    const status = (block.match(/"BatteryStatusFlags"\s*=\s*(\d+)/) || [])[1];
    devices.push({
      id: 'mac-' + addr.replace(/[^a-z0-9]/gi, ''),
      name,
      type: classify(name),
      level: Math.max(0, Math.min(100, Number(pct))),
      charging: status !== undefined && (Number(status) & 2) === 2,
      connected: true,
      source: 'Bluetooth',
    });
  }
  return devices;
}

function parsePmset(stdout) {
  const m = String(stdout || '').match(/InternalBattery[^\t]*\t(\d+)%;\s*([a-z ]+);/i);
  if (!m) return [];
  return [{
    id: 'mac-sys',
    name: 'Dieser Mac',
    type: 'system',
    level: Number(m[1]),
    charging: /^(charging|charged|finishing charge)$/i.test(m[2].trim()),
    connected: true,
    source: 'System',
  }];
}

async function getDevices() {
  const [io, pm] = await Promise.all([run('ioreg', ['-r', '-l', '-k', 'BatteryPercent']), run('pmset', ['-g', 'batt'])]);
  return [...parseIoreg(io), ...parsePmset(pm)];
}

module.exports = { getDevices, parseIoreg, parsePmset };
