'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseWindowsOutput, cleanName } = require('../src/main/battery/windows');
const { parseUpower } = require('../src/main/battery/linux');
const { parseIoreg, parsePmset } = require('../src/main/battery/mac');
const { classify } = require('../src/main/battery/classify');
const { sortDevices, readDevices } = require('../src/main/battery');

test('Gerätetypen werden am Namen erkannt', () => {
  assert.strictEqual(classify('MX Master 3S'), 'mouse');
  assert.strictEqual(classify('Logitech G305'), 'mouse');
  assert.strictEqual(classify('MX Keys Mini'), 'keyboard');
  assert.strictEqual(classify('Keychron K2'), 'keyboard');
  assert.strictEqual(classify('WH-1000XM4'), 'headset');
  assert.strictEqual(classify('AirPods Pro'), 'headset');
  assert.strictEqual(classify('Xbox Wireless Controller'), 'controller');
  assert.strictEqual(classify('DualSense Wireless Controller'), 'controller');
  assert.strictEqual(classify('JBL Flip 5'), 'speaker');
  assert.strictEqual(classify('Irgendwas'), 'other');
  assert.strictEqual(classify('Irgendwas', 'keyboard'), 'keyboard');
});

test('Windows: Bluetooth-Geräte und Systemakku werden gelesen', () => {
  const out = '﻿' + JSON.stringify({
    bt: [
      { id: 'BTHLE\\DEV_D1A2B3C4D5E6\\7&1A2B&0&D1A2B3C4D5E6', name: 'MX Master 3S', cls: 'Bluetooth', status: 'OK', battery: 76, connected: true },
      { id: 'BTHENUM\\{0000111E-0000-1000-8000-00805F9B34FB}_LOCALMFG&000F\\7&2&0&A0B1C2D3E4F5_C00000000', name: 'WH-1000XM4 Hands-Free AG', cls: 'System', status: 'OK', battery: 40, connected: null },
      { id: 'BTHENUM\\{0000110B-0000-1000-8000-00805F9B34FB}_LOCALMFG&000F\\7&3&0&A0B1C2D3E4F5_C00000000', name: 'WH-1000XM4 Stereo', cls: 'Media', status: 'Unknown', battery: 40, connected: null },
      { id: 'BTHLE\\DEV_FFEEDDCCBBAA\\x', name: 'Kaputt', status: 'OK', battery: 255 },
    ],
    sys: { id: 'BAT0', name: 'Internal', battery: 64, status: 2 },
  });
  const devices = parseWindowsOutput(out);
  assert.strictEqual(devices.length, 3);
  const mouse = devices.find((d) => d.type === 'mouse');
  assert.deepStrictEqual([mouse.name, mouse.level, mouse.connected], ['MX Master 3S', 76, true]);
  const headset = devices.find((d) => d.type === 'headset');
  assert.strictEqual(headset.name, 'WH-1000XM4');
  assert.strictEqual(headset.connected, true);
  const sys = devices.find((d) => d.type === 'system');
  assert.deepStrictEqual([sys.level, sys.charging], [64, true]);
});

test('Windows: leere Ausgabe ergibt keine Geräte', () => {
  assert.deepStrictEqual(parseWindowsOutput(''), []);
  assert.deepStrictEqual(parseWindowsOutput('{"bt":[],"sys":[]}'), []);
  assert.strictEqual(cleanName('Galaxy Buds2 Avrcp Transport'), 'Galaxy Buds2');
});

test('Linux: UPower-Ausgabe wird ausgewertet', () => {
  const dump = `Device: /org/freedesktop/UPower/devices/battery_BAT0
  native-path:          BAT0
  power supply:         yes
  battery
    present:             yes
    state:               charging
    percentage:          57%

Device: /org/freedesktop/UPower/devices/mouse_hidpp_battery_0
  native-path:          hidpp_battery_0
  model:                MX Anywhere 3
  power supply:         no
  mouse
    present:             yes
    state:               discharging
    percentage:          15% (should be ignored)

Device: /org/freedesktop/UPower/devices/keyboard_dev_AA
  model:                Keychron K3
  power supply:         no
  keyboard
    percentage:          90%

Device: /org/freedesktop/UPower/devices/line_power_AC
  power supply:         yes
  line-power
    online:              yes

Device: /org/freedesktop/UPower/devices/DisplayDevice
  power supply:         yes
  battery
    percentage:          57%
`;
  const devices = parseUpower(dump);
  assert.strictEqual(devices.length, 3);
  assert.deepStrictEqual(devices.map((d) => d.type), ['system', 'mouse', 'keyboard']);
  assert.strictEqual(devices[0].charging, true);
  assert.strictEqual(devices[1].level, 15);
  assert.strictEqual(devices[1].name, 'MX Anywhere 3');
});

test('macOS: ioreg und pmset werden ausgewertet', () => {
  const io = `+-o AppleDeviceManagementHIDEventService  <class AppleDeviceManagementHIDEventService>
    {
      "Product" = "Magic Mouse"
      "BatteryPercent" = 63
      "DeviceAddress" = "aa-bb-cc"
    }
+-o AppleDeviceManagementHIDEventService  <class AppleDeviceManagementHIDEventService>
    {
      "Product" = "Magic Mouse"
      "BatteryPercent" = 63
      "DeviceAddress" = "aa-bb-cc"
    }
+-o Other
    {
      "Product" = "Magic Keyboard"
      "BatteryPercent" = 20
      "BatteryStatusFlags" = 3
    }`;
  const devices = parseIoreg(io);
  assert.strictEqual(devices.length, 2);
  assert.strictEqual(devices[0].type, 'mouse');
  assert.strictEqual(devices[1].charging, true);
  const sys = parsePmset("Now drawing from 'AC Power'\n -InternalBattery-0 (id=123)\t88%; charging; 0:40 remaining present: true");
  assert.deepStrictEqual([sys[0].level, sys[0].charging], [88, true]);
});

test('Sortierung: Maus vor Tastatur, PC zuletzt', () => {
  const sorted = sortDevices([
    { name: 'PC', type: 'system' },
    { name: 'B', type: 'keyboard' },
    { name: 'A', type: 'mouse' },
  ]);
  assert.deepStrictEqual(sorted.map((d) => d.type), ['mouse', 'keyboard', 'system']);
});

test('Demo-Modus liefert Beispielgeräte', async () => {
  const res = await readDevices({ demo: true });
  assert.strictEqual(res.error, null);
  assert.ok(res.devices.length >= 3);
  for (const d of res.devices) assert.ok(d.level >= 0 && d.level <= 100);
});
