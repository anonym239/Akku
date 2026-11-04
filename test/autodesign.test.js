'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { analyzePixels, analyzeBehind, designFrom, hslToHex, rgbToHsl } = require('../src/main/autodesign');

function image(w, h, fn) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      buf[i] = b; // BGRA
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

test('Helles Bild ergibt helles Widget, dunkles Bild dunkles Widget', () => {
  const light = image(20, 20, () => [235, 240, 250]);
  const dark = image(20, 20, () => [15, 20, 40]);
  assert.strictEqual(designFrom(analyzePixels(light, 20, 20, { x: 0, y: 0, width: 20, height: 20 })).widgetTone, 'light');
  assert.strictEqual(designFrom(analyzePixels(dark, 20, 20, { x: 0, y: 0, width: 20, height: 20 })).widgetTone, 'dark');
});

test('Akzentfarbe kommt aus der kräftigsten Farbe des Bildes', () => {
  const img = image(20, 20, (x) => (x < 12 ? [30, 30, 35] : [230, 90, 20]));
  const d = designFrom(analyzePixels(img, 20, 20, { x: 0, y: 0, width: 20, height: 20 }));
  const [h] = rgbToHsl(parseInt(d.accent.slice(1, 3), 16), parseInt(d.accent.slice(3, 5), 16), parseInt(d.accent.slice(5, 7), 16));
  assert.ok(h >= 10 && h <= 35, `Farbton ${h} sollte orange sein`);
});

test('Unruhige Bilder bekommen mehr Tönung und Unschärfe', () => {
  const calm = image(20, 20, () => [60, 70, 90]);
  const busy = image(20, 20, (x, y) => ((x + y) % 2 ? [250, 250, 250] : [5, 5, 5]));
  const a = designFrom(analyzePixels(calm, 20, 20, { x: 0, y: 0, width: 20, height: 20 }));
  const b = designFrom(analyzePixels(busy, 20, 20, { x: 0, y: 0, width: 20, height: 20 }));
  assert.ok(b.opacity > a.opacity);
  assert.ok(b.blur > a.blur);
});

test('Nur der Bereich hinter dem Widget zählt', () => {
  // Linke Hälfte schwarz, rechte weiß; Bild füllt einen 200×100-Bildschirm.
  const buf = image(40, 20, (x) => (x < 20 ? [0, 0, 0] : [255, 255, 255]));
  const wall = { width: 1600, height: 800, fit: 'fill', sample: { buf, width: 40, height: 20 } };
  const display = { x: 0, y: 0, width: 200, height: 100, scaleFactor: 1 };
  assert.strictEqual(designFrom(analyzeBehind(wall, display, { x: 150, y: 10, width: 40, height: 30 })).widgetTone, 'light');
  assert.strictEqual(designFrom(analyzeBehind(wall, display, { x: 10, y: 10, width: 40, height: 30 })).widgetTone, 'dark');
});

test('Farbumrechnung', () => {
  assert.strictEqual(hslToHex(0, 1, 0.5), '#ff0000');
  assert.strictEqual(hslToHex(120, 1, 0.25), '#008000');
});
