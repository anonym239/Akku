'use strict';

// Liest das aktuelle Desktop-Hintergrundbild, damit das Widget im Glas-Stil
// den passenden Ausschnitt verschwommen hinter sich zeigen kann – wie die
// Widgets auf dem Mac oder iPhone.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

function regValue(stdout, name) {
  const m = stdout.match(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, 'mi'));
  return m ? m[1].trim() : '';
}

// Windows-Darstellung: 10 Füllen, 6 Anpassen, 2 Strecken, 0 Zentriert (+Tile = Kacheln), 22 Strecken über alle
function windowsFit(style, tile) {
  if (tile === '1') return 'tile';
  return { 10: 'fill', 6: 'fit', 2: 'stretch', 0: 'center', 22: 'span' }[style] || 'fill';
}

function rgbToHex(text) {
  const p = String(text).trim().split(/\s+/).map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
  return '#' + p.map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}

async function locate() {
  if (process.env.AKKU_WALLPAPER) return { file: process.env.AKKU_WALLPAPER, fit: process.env.AKKU_WALLPAPER_FIT || 'fill', color: '#000000' };

  if (process.platform === 'win32') {
    const desk = await run('reg', ['query', 'HKCU\\Control Panel\\Desktop']);
    const colors = await run('reg', ['query', 'HKCU\\Control Panel\\Colors', '/v', 'Background']);
    const fit = windowsFit(regValue(desk, 'WallpaperStyle'), regValue(desk, 'TileWallpaper'));
    const color = rgbToHex(regValue(colors, 'Background')) || '#000000';
    const transcoded = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
    const regFile = regValue(desk, 'WallPaper');
    const file = [transcoded, regFile].find((f) => f && fs.existsSync(f)) || null;
    return { file, fit, color };
  }

  if (process.platform === 'darwin') {
    const out = await run('osascript', ['-e', 'tell application "System Events" to get picture of current desktop']);
    return { file: out.trim() || null, fit: 'fill', color: '#000000' };
  }

  // Linux (GNOME und kompatible)
  const dark = (await run('gsettings', ['get', 'org.gnome.desktop.interface', 'color-scheme'])).includes('dark');
  let uri = (await run('gsettings', ['get', 'org.gnome.desktop.background', dark ? 'picture-uri-dark' : 'picture-uri'])).trim();
  if (!uri || uri === "''") uri = (await run('gsettings', ['get', 'org.gnome.desktop.background', 'picture-uri'])).trim();
  const opts = (await run('gsettings', ['get', 'org.gnome.desktop.background', 'picture-options'])).replace(/'/g, '').trim();
  const color = (await run('gsettings', ['get', 'org.gnome.desktop.background', 'primary-color'])).replace(/'/g, '').trim();
  const file = uri.replace(/^'|'$/g, '').replace(/^file:\/\//, '');
  const fit = { zoom: 'fill', scaled: 'fit', stretched: 'stretch', centered: 'center', wallpaper: 'tile', spanned: 'span' }[opts] || 'fill';
  return { file: file ? decodeURIComponent(file) : null, fit, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000' };
}

let cache = { key: null, value: null };

// Liefert { url, width, height, fit, color } oder null. Das Bild wird für
// das Widget verkleinert und als data-URL übergeben.
async function getWallpaper(nativeImage) {
  const info = await locate();
  if (!info.file) return { url: null, width: 0, height: 0, fit: info.fit, color: info.color };
  let stat;
  try {
    stat = fs.statSync(info.file);
  } catch {
    return { url: null, width: 0, height: 0, fit: info.fit, color: info.color };
  }
  const key = `${info.file}|${stat.mtimeMs}|${stat.size}|${info.fit}|${info.color}`;
  if (cache.key === key) return cache.value;

  let img = nativeImage.createFromBuffer(fs.readFileSync(info.file));
  if (img.isEmpty()) img = nativeImage.createFromPath(info.file);
  if (img.isEmpty()) return { url: null, width: 0, height: 0, fit: info.fit, color: info.color };
  const size = img.getSize();
  const small = size.width > 2560 ? img.resize({ width: 2560, quality: 'good' }) : img;
  const tiny = img.resize({ width: 240, quality: 'good' });
  const tinySize = tiny.getSize();
  const value = {
    url: 'data:image/jpeg;base64,' + small.toJPEG(85).toString('base64'),
    width: size.width,
    height: size.height,
    fit: info.fit,
    color: info.color,
    // Kleines Vorschaubild für das Auto-Design (wird nicht an die Fenster geschickt)
    sample: { buf: tiny.toBitmap(), width: tinySize.width, height: tinySize.height },
  };
  cache = { key, value };
  return value;
}

module.exports = { getWallpaper, windowsFit, rgbToHex, regValue };
