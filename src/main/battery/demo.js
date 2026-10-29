'use strict';

// Beispielgeräte, um das Widget ohne passende Hardware auszuprobieren.
const DEMO = [
  { id: 'demo-mouse', name: 'MX Master 3S', type: 'mouse', level: 82, drain: 0.4 },
  { id: 'demo-keyboard', name: 'MX Keys', type: 'keyboard', level: 46, drain: 0.2 },
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
        source: 'Demo',
      };
    })
  );
}

module.exports = { getDevices };
