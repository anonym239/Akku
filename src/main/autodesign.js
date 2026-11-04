'use strict';

// Auto-Design: analysiert den Ausschnitt des Hintergrundbilds hinter dem
// Widget und wählt daraus Helligkeit, Akzentfarbe, Tönung und Unschärfe.
// Läuft komplett lokal – ohne Internet und ohne API-Schlüssel.

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

// Relative Helligkeit nach WCAG (0 = schwarz, 1 = weiß)
function luminance(r, g, b) {
  const c = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// Wertet Pixel (BGRA, wie nativeImage.toBitmap liefert) in einem Rechteck aus.
function analyzePixels(buf, width, height, rect, order = 'bgra') {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  const ri = order === 'rgba' ? 0 : 2;
  const bi = order === 'rgba' ? 2 : 0;
  let n = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const hues = new Array(12).fill(0).map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const r = buf[i + ri];
      const g = buf[i + 1];
      const b = buf[i + bi];
      const lum = luminance(r, g, b);
      n++;
      sumL += lum;
      sumL2 += lum * lum;
      sr += r;
      sg += g;
      sb += b;
      const [h, s, l] = rgbToHsl(r, g, b);
      // Kräftige Farben zählen mehr – daraus wird die Akzentfarbe.
      const weight = s * (1 - Math.abs(l - 0.5) * 2);
      if (weight > 0.12) {
        const bucket = hues[Math.floor(h / 30) % 12];
        bucket.w += weight;
        bucket.r += r * weight;
        bucket.g += g * weight;
        bucket.b += b * weight;
      }
    }
  }
  if (!n) return null;
  const mean = sumL / n;
  const busy = Math.sqrt(Math.max(0, sumL2 / n - mean * mean)); // Unruhe des Bildes
  const best = hues.reduce((a, b) => (b.w > a.w ? b : a));
  const dominant = best.w > n * 0.02 ? [best.r / best.w, best.g / best.w, best.b / best.w] : null;
  return { luminance: mean, busy, average: [sr / n, sg / n, sb / n], dominant };
}

// Leitet aus der Analyse passende Einstellungen ab.
function designFrom(analysis, { hasWallpaper = true } = {}) {
  if (!analysis) return null;
  const light = analysis.luminance > 0.42;
  const busy = Math.min(1, analysis.busy / 0.25);
  let accent = null;
  if (analysis.dominant) {
    const [h, s] = rgbToHsl(...analysis.dominant);
    // Gut lesbar machen: kräftig, auf hellem Grund dunkler, auf dunklem heller.
    accent = hslToHex(h, Math.max(0.55, Math.min(0.85, s + 0.15)), light ? 0.45 : 0.62);
  }
  return {
    style: hasWallpaper ? 'glass' : 'transparent',
    widgetTone: light ? 'light' : 'dark',
    opacity: Math.round((light ? 0.5 : 0.48) * 100 + busy * 22) / 100,
    blur: Math.round(18 + busy * 16),
    ...(accent ? { accent } : {}),
  };
}

// Wie das Bild auf dem Bildschirm liegt (gleiche Logik wie im Widget).
function placement(wall, area) {
  const sf = area.scaleFactor || 1;
  const iw = wall.width / sf;
  const ih = wall.height / sf;
  let w = area.width;
  let h = area.height;
  if (wall.fit === 'fill' || wall.fit === 'span') {
    const k = Math.max(area.width / iw, area.height / ih);
    w = iw * k;
    h = ih * k;
  } else if (wall.fit === 'fit') {
    const k = Math.min(area.width / iw, area.height / ih);
    w = iw * k;
    h = ih * k;
  } else if (wall.fit === 'center' || wall.fit === 'tile') {
    w = iw;
    h = ih;
  }
  const x = wall.fit === 'tile' ? area.x : area.x + (area.width - w) / 2;
  const y = wall.fit === 'tile' ? area.y : area.y + (area.height - h) / 2;
  return { x, y, w, h };
}

// Analysiert den Bereich des Hintergrundbilds, der hinter rect (Bildschirm-
// koordinaten) liegt.
function analyzeBehind(wall, display, rect) {
  if (!wall || !wall.sample || !wall.width) return null;
  const p = placement(wall, display);
  const { buf, width, height } = wall.sample;
  const sx = width / p.w;
  const sy = height / p.h;
  let x = (rect.x - p.x) * sx;
  let y = (rect.y - p.y) * sy;
  let w = rect.width * sx;
  let h = rect.height * sy;
  if (wall.fit === 'tile') {
    x = ((x % width) + width) % width;
    y = ((y % height) + height) % height;
  }
  // Liegt das Widget neben dem Bild (z. B. bei "Anpassen"), das ganze Bild nehmen.
  if (x + w <= 0 || y + h <= 0 || x >= width || y >= height) {
    x = 0;
    y = 0;
    w = width;
    h = height;
  }
  return analyzePixels(buf, width, height, { x, y, width: Math.max(1, w), height: Math.max(1, h) });
}

module.exports = { analyzePixels, analyzeBehind, placement, designFrom, rgbToHsl, hslToHex, luminance };
