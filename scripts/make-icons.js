'use strict';

// Erzeugt aus build/icon.svg alle PNG-Größen und eine Windows-.ico.
// Benötigt Playwright mit Chromium (nur für Entwickler).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(ROOT, 'build', 'icon.svg'), 'utf8');

async function render(page, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// ICO-Datei mit eingebetteten PNGs (von Windows Vista an unterstützt).
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngs = {};
  for (const size of sizes) pngs[size] = await render(page, size);
  await browser.close();

  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), pngs[512]);
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.png'), pngs[256]);
  fs.writeFileSync(path.join(ROOT, 'assets', 'tray.png'), pngs[32]);
  fs.writeFileSync(path.join(ROOT, 'assets', 'tray@2x.png'), pngs[64]);
  fs.writeFileSync(
    path.join(ROOT, 'build', 'icon.ico'),
    buildIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngs[size] })))
  );
  console.log('Icons erstellt.');
})();
