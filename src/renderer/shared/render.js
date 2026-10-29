'use strict';

// Gemeinsame Darstellung: wird vom Widget und von der Vorschau im
// Einstellungsfenster verwendet.
(function () {
  const ICONS = window.AkkuIcons;

  const TYPE_LABEL = {
    mouse: 'Maus',
    keyboard: 'Tastatur',
    headset: 'Kopfhörer',
    controller: 'Controller',
    speaker: 'Lautsprecher',
    pen: 'Stift',
    phone: 'Handy',
    watch: 'Uhr',
    system: 'Dieser PC',
    other: 'Gerät',
  };

  const SIZES = { compact: 12, normal: 14, large: 16 };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function levelTone(level, low) {
    if (level <= low) return 'bad';
    if (level <= Math.max(40, low + 15)) return 'warn';
    return 'good';
  }

  function visibleDevices(devices, cfg) {
    return (devices || [])
      .filter((d) => !cfg.hidden.includes(d.id))
      .filter((d) => cfg.showSystemBattery || d.type !== 'system')
      .filter((d) => cfg.showDisconnected || d.connected)
      .map((d) => ({ ...d, name: cfg.names[d.id] || d.name }));
  }

  function statusText(d, cfg) {
    if (d.charging) return d.level >= 100 ? 'Voll geladen' : 'Lädt';
    if (!d.connected) return 'Getrennt';
    if (d.level <= cfg.lowThreshold) return 'Bitte aufladen';
    return TYPE_LABEL[d.type] || 'Gerät';
  }

  function relTime(at, now = Date.now()) {
    if (!at) return '';
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 45) return 'gerade eben';
    const m = Math.round(s / 60);
    if (m < 60) return `vor ${m} Min.`;
    const h = Math.round(m / 60);
    return `vor ${h} Std.`;
  }

  function deviceIcon(type) {
    return ICONS[type] || ICONS.other;
  }

  function rowHtml(d, cfg) {
    const tone = d.charging ? 'charge' : levelTone(d.level, cfg.lowThreshold);
    return `
      <div class="w-row tone-${tone}${d.connected ? '' : ' is-off'}" title="${esc(d.name)} – ${d.level} %">
        <div class="w-ico">${deviceIcon(d.type)}</div>
        <div class="w-info">
          <div class="w-line">
            <span class="w-name">${esc(d.name)}</span>
            ${cfg.showPercent ? `<span class="w-pct">${d.charging ? `<i class="w-bolt">${ICONS.bolt}</i>` : ''}${d.level}<small>%</small></span>` : ''}
          </div>
          <div class="w-bar"><span style="width:${Math.max(3, d.level)}%"></span></div>
          ${cfg.showStatus ? `<div class="w-meta">${esc(statusText(d, cfg))}</div>` : ''}
        </div>
      </div>`;
  }

  function ringHtml(d, cfg) {
    const tone = d.charging ? 'charge' : levelTone(d.level, cfg.lowThreshold);
    const r = 26;
    const c = 2 * Math.PI * r;
    const dash = (Math.max(0, Math.min(100, d.level)) / 100) * c;
    return `
      <div class="w-ring tone-${tone}${d.connected ? '' : ' is-off'}" title="${esc(d.name)} – ${statusText(d, cfg)}">
        <div class="w-ring-gfx">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle class="track" cx="32" cy="32" r="${r}"/>
            <circle class="value" cx="32" cy="32" r="${r}" stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}"/>
          </svg>
          <div class="w-ring-ico">${deviceIcon(d.type)}</div>
          ${d.charging ? `<i class="w-ring-bolt">${ICONS.bolt}</i>` : ''}
        </div>
        ${cfg.showPercent ? `<div class="w-ring-pct">${d.level}<small>%</small></div>` : ''}
        ${cfg.showStatus ? `<div class="w-ring-name">${esc(d.name)}</div>` : ''}
      </div>`;
  }

  function ringColumns(count) {
    if (count <= 1) return 1;
    if (count <= 4) return count === 3 ? 3 : 2;
    return count <= 6 ? 3 : 4;
  }

  // Erzeugt den kompletten Inhalt der Widget-Karte.
  function widgetHtml(state, cfg, opts = {}) {
    const devices = visibleDevices(state.devices, cfg);
    let body;
    if (devices.length === 0) {
      body = `
        <div class="w-empty">
          <div class="w-empty-ico">${ICONS.other}</div>
          <div class="w-empty-title">${state.error ? 'Akkustand nicht lesbar' : 'Keine Geräte gefunden'}</div>
          <div class="w-empty-text">${esc(state.error ? state.error : 'Koppel eine Maus, Tastatur oder ein Headset per Bluetooth.')}</div>
          <button class="w-btn" data-act="settings">Einstellungen</button>
        </div>`;
    } else if (cfg.layout === 'rings') {
      body = `<div class="w-grid" style="--cols:${ringColumns(devices.length)}">${devices.map((d) => ringHtml(d, cfg)).join('')}</div>`;
    } else {
      body = `<div class="w-list">${devices.map((d) => rowHtml(d, cfg)).join('')}</div>`;
    }
    const time = state.at ? relTime(state.at, opts.now) : 'lädt …';
    return `
      <div class="w-head">
        <div class="w-title"><span class="w-logo">${ICONS.battery}</span>Akkus</div>
        <div class="w-tools">
          <span class="w-time">${esc(time)}</span>
          <span class="w-btns">
            <button class="w-icon-btn" data-act="refresh" title="Aktualisieren">${ICONS.refresh}</button>
            <button class="w-icon-btn" data-act="settings" title="Einstellungen">${ICONS.settings}</button>
          </span>
        </div>
      </div>
      ${body}`;
  }

  function applyCardStyle(card, cfg) {
    card.className = `w-card layout-${cfg.layout}${cfg.locked ? ' is-locked' : ''}`;
    card.style.fontSize = (SIZES[cfg.size] || 14) + 'px';
    card.style.setProperty('--w-opacity', String(Math.round(cfg.opacity * 100)) + '%');
  }

  function resolveTheme(cfg) {
    if (cfg.theme === 'dark' || cfg.theme === 'light') return cfg.theme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(cfg) {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(cfg);
    root.style.setProperty('--accent', cfg.accent);
  }

  // Fehler sammeln, damit der automatische Test sie auswerten kann.
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

  window.AkkuUI = { TYPE_LABEL, esc, levelTone, visibleDevices, statusText, relTime, widgetHtml, applyCardStyle, applyTheme, resolveTheme, deviceIcon, ringColumns };
})();
