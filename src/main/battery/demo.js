'use strict';

// Beispielgeräte, um das Widget ohne passende Hardware auszuprobieren.
const DEMO = [
  { id: 'demo-mouse', name: 'MX Master 3S', type: 'mouse', level: 82, drain: 0.4, source: 'USB-Empfänger (Logitech)' },
  { id: 'demo-keyboard', name: 'MX Keys', type: 'keyboard', level: 46, drain: 0.2, source: 'USB-Empfänger (Logitech)' },
  { id: 'demo-headset', name: 'WH-1000XM5', type: 'headset', level: 14, drain: 0.6 },
  { id: 'demo-controller', name: 'Xbox Wireless Controller', type: 'controller', level: 63, drain: 0, charging: true },
];

const started = Date.now();

function getDevices() {
  const minutes = (Date.now() - started) / 60000;
  return Promise.resolve(
    DEMO.map((d) => {
      const delta = d.charging ? -minutes * 2 : minutes * d.drain;
      let level = d.level - delta;
      level = Math.round(Math.max(1, Math.min(100, level)));
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        level,
        charging: Boolean(d.charging) && level < 100,
        connected: true,
        source: d.source || 'Bluetooth',
      };
    })
  );
}

function receivers() {
  return [
    { id: 'demo-bolt', name: 'USB Receiver (Bolt)', vendor: 'Logitech', kind: 'receiver', status: 'ok', count: 2 },
    { id: 'demo-other', name: '2.4G Wireless Receiver', vendor: 'Unbekannt', kind: 'receiver', status: 'unsupported', vid: '25a7', pid: 'fa61' },
  ];
}

module.exports = { getDevices, receivers };
