'use strict';

const test = require('node:test');
const assert = require('node:assert');
const hid = require('../src/main/battery/hid');
const { voltageToPercent } = require('../src/main/battery/hid/hidpp');
const { readDevices } = require('../src/main/battery');
const { mockHid, logitechReceiver, razerDongle } = require('./mock-hid');

function bolt(offline = []) {
  return logitechReceiver({
    product: 'USB Receiver',
    offline,
    devices: {
      1: { name: 'MX Master 3S', type: 3, features: { 0x0005: 3, 0x1004: 6 }, unified: [37, 0x04, 0, 0] },
      2: { name: 'MX Keys S', type: 0, features: { 0x0005: 3, 0x1004: 6 }, unified: [88, 0x08, 1, 1] },
      3: { name: 'G305', type: 3, features: { 0x0005: 4, 0x1001: 7 }, voltage: [0x0e, 0xd8, 0x00] },
    },
  });
}

test('Logitech-Empfänger: Maus und Tastatur werden ausgelesen', async () => {
  hid._lastKnown.clear();
  const res = await hid.getDevices({ hid: mockHid(bolt()) });
  assert.strictEqual(res.error, null);
  assert.strictEqual(res.devices.length, 3);
  const [mouse, keys, g305] = res.devices;
  assert.deepStrictEqual([mouse.name, mouse.type, mouse.level, mouse.charging], ['MX Master 3S', 'mouse', 37, false]);
  assert.deepStrictEqual([keys.name, keys.type, keys.level, keys.charging], ['MX Keys S', 'keyboard', 88, true]);
  assert.strictEqual(g305.name, 'G305');
  assert.strictEqual(g305.level, voltageToPercent(0x0ed8));
  assert.strictEqual(mouse.source, 'USB-Empfänger (Logitech)');
  assert.deepStrictEqual(res.notes.map((n) => [n.vendor, n.status, n.count]), [['Logitech', 'ok', 3]]);
});

test('Logitech: ausgeschaltetes Gerät bleibt mit letztem Stand als "getrennt" sichtbar', async () => {
  hid._lastKnown.clear();
  await hid.getDevices({ hid: mockHid(bolt()) });
  const res = await hid.getDevices({ hid: mockHid(bolt([1])) });
  const mouse = res.devices.find((d) => d.name === 'MX Master 3S');
  assert.strictEqual(mouse.connected, false);
  assert.strictEqual(mouse.level, 37);
  assert.strictEqual(res.devices.filter((d) => d.connected).length, 2);
});

test('Razer-Dongle wird ausgelesen', async () => {
  const res = await hid.getDevices({ hid: mockHid(razerDongle({ level: 204, charging: 1 })) });
  assert.strictEqual(res.devices.length, 1);
  const d = res.devices[0];
  assert.deepStrictEqual([d.name, d.type, d.level, d.charging], ['Razer Viper Ultimate', 'mouse', 80, true]);
});

test('Unbekannter 2,4-GHz-Empfänger wird erkannt und als nicht lesbar gemeldet', async () => {
  const other = { list: [{ vendorId: 0x25a7, productId: 0xfa61, product: '2.4G Wireless Receiver', manufacturer: 'Compx', interface: 0, usagePage: 1, usage: 2, path: 'x' }] };
  const res = await hid.getDevices({ hid: mockHid(other) });
  assert.strictEqual(res.devices.length, 0);
  assert.strictEqual(res.notes.length, 1);
  assert.deepStrictEqual([res.notes[0].status, res.notes[0].kind, res.notes[0].vid], ['unsupported', 'receiver', '25a7']);
});

test('Spannung wird in Prozent umgerechnet', () => {
  assert.strictEqual(voltageToPercent(4250), 100);
  assert.strictEqual(voltageToPercent(3830), 50);
  assert.strictEqual(voltageToPercent(3400), 0);
  assert.ok(voltageToPercent(3850) > 50 && voltageToPercent(3850) < 60);
});

test('readDevices kombiniert System und USB-Empfänger', async () => {
  hid._lastKnown.clear();
  const res = await readDevices({ hidModule: mockHid(bolt(), razerDongle({})) });
  assert.ok(res.devices.some((d) => d.name === 'MX Master 3S'));
  assert.ok(res.devices.some((d) => d.name === 'Razer Viper Ultimate'));
  assert.strictEqual(res.error, null);
  assert.ok(Array.isArray(res.receivers));
});
