'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, DEFAULTS, sanitize } = require('../src/main/store');

test('Ungültige Werte werden verworfen oder begrenzt', () => {
  const out = sanitize({ theme: 'pink', opacity: 7, refreshSec: 1, accent: 'red', unknown: 1, layout: 'rings', names: { a: '  Maus  ', b: '' } });
  assert.deepStrictEqual(out, { opacity: 1, refreshSec: 10, layout: 'rings', names: { a: 'Maus' } });
});

test('Einstellungen werden gespeichert und wieder geladen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akku-'));
  const a = new Store(dir);
  assert.strictEqual(a.get().theme, DEFAULTS.theme);
  a.set({ theme: 'light', hidden: ['x', 'x'], widgetPos: { x: 10.4, y: 20 } });
  const b = new Store(dir);
  assert.strictEqual(b.get().theme, 'light');
  assert.deepStrictEqual(b.get().hidden, ['x']);
  assert.deepStrictEqual(b.get().widgetPos, { x: 10, y: 20 });
  b.reset();
  assert.strictEqual(new Store(dir).get().theme, DEFAULTS.theme);
  assert.deepStrictEqual(new Store(dir).get().widgetPos, { x: 10, y: 20 });
});

test('Kaputte Datei führt zu Standardwerten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akku-'));
  fs.writeFileSync(path.join(dir, 'einstellungen.json'), '{kaputt');
  assert.deepStrictEqual(new Store(dir).get(), { ...DEFAULTS, hidden: [], names: {} });
});
