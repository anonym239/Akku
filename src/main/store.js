'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  theme: 'auto', // auto | dark | light
  accent: '#7c5cff',
  style: 'glass', // glass (wie Apple) | transparent | solid
  autoDesign: true, // Aussehen automatisch an das Hintergrundbild anpassen
  widgetTone: 'theme', // theme | dark | light – Helligkeit des Widgets
  layout: 'gauge', // gauge (Bogen wie iOS) | rings | list
  gaugeText: 'below', // below | gap | none – wo die Prozentzahl beim Bogen steht
  scale: 100, // Größe in %
  width: 19, // Breite der Liste (em)
  columns: 0, // Spalten bei Ringen, 0 = automatisch
  radius: 24, // Eckenradius in px bei 100 %
  blur: 24, // Unschärfe des Hintergrundbilds (Glas)
  opacity: 0.4, // Tönung bzw. Deckkraft des Hintergrunds
  showHeader: true,
  showPercent: true,
  showStatus: true,
  showSystemBattery: true,
  showDisconnected: true,
  alwaysOnTop: false,
  locked: false,
  showWidget: true,
  autostart: true,
  openSettingsOnStart: true,
  refreshSec: 60,
  lowThreshold: 20,
  notifyLow: true,
  demo: false,
  hidden: [],
  names: {},
  widgetPos: null,
});

const LIMITS = {
  opacity: [0, 1],
  refreshSec: [10, 3600],
  lowThreshold: [5, 50],
  scale: [60, 200],
  width: [14, 32],
  columns: [0, 4],
  radius: [0, 40],
  blur: [0, 40],
};

const ENUMS = {
  theme: ['auto', 'dark', 'light'],
  layout: ['list', 'rings', 'gauge'],
  gaugeText: ['below', 'gap', 'none'],
  widgetTone: ['theme', 'dark', 'light'],
  style: ['glass', 'transparent', 'solid'],
};

// Prüft und bereinigt einen (Teil-)Datensatz, damit kaputte Werte
// das Widget nie unbrauchbar machen.
function sanitize(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!(key in DEFAULTS)) continue;
    const def = DEFAULTS[key];
    if (ENUMS[key]) {
      if (ENUMS[key].includes(value)) out[key] = value;
    } else if (LIMITS[key]) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], n));
    } else if (key === 'accent') {
      if (/^#[0-9a-f]{6}$/i.test(value)) out[key] = value.toLowerCase();
    } else if (key === 'hidden') {
      if (Array.isArray(value)) out[key] = [...new Set(value.filter((v) => typeof v === 'string'))];
    } else if (key === 'names') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = {};
        for (const [id, name] of Object.entries(value)) {
          if (typeof name === 'string' && name.trim()) out[key][id] = name.trim().slice(0, 40);
        }
      }
    } else if (key === 'widgetPos') {
      if (value === null) out[key] = null;
      else if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) out[key] = { x: Math.round(value.x), y: Math.round(value.y) };
    } else if (typeof def === 'boolean') {
      out[key] = Boolean(value);
    }
  }
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'einstellungen.json');
    this.data = { ...DEFAULTS };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      // Ältere Versionen kannten nur drei feste Größen.
      if (raw.size && raw.scale === undefined) raw.scale = { compact: 85, normal: 100, large: 115 }[raw.size];
      Object.assign(this.data, sanitize(raw));
    } catch {
      // Erster Start oder kaputte Datei: Standardwerte verwenden.
    }
  }

  get() {
    return { ...this.data, hidden: [...this.data.hidden], names: { ...this.data.names } };
  }

  set(partial) {
    const clean = sanitize(partial);
    Object.assign(this.data, clean);
    this.save();
    return clean;
  }

  reset() {
    const keep = { widgetPos: this.data.widgetPos };
    this.data = { ...DEFAULTS, hidden: [], names: {}, ...keep };
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('Einstellungen konnten nicht gespeichert werden:', err);
    }
  }
}

module.exports = { Store, DEFAULTS, sanitize };
