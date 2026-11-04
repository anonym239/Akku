'use strict';

(function () {
  const { widgetHtml, applyCardStyle, applyTheme, placeGlass } = window.AkkuUI;
  const api = window.akku;
  const card = document.getElementById('card');
  const stage = document.querySelector('.stage');

  let cfg = null;
  let state = { devices: [], error: null, at: 0 };
  let wallpaper = null;
  let geo = null;

  function render() {
    if (!cfg) return;
    applyTheme(cfg);
    applyCardStyle(card, cfg, { hasWallpaper: Boolean(wallpaper && wallpaper.url) });
    card.innerHTML = widgetHtml(state, cfg);
    glass();
    fit();
  }

  // Den Teil des Hintergrundbilds, der genau hinter der Karte liegt, verschwommen anzeigen.
  function glass() {
    if (!cfg || cfg.style !== 'glass' || !geo) return;
    const r = card.getBoundingClientRect();
    placeGlass(card, wallpaper, geo.display, { left: geo.x + r.left, top: geo.y + r.top });
  }

  // Fenstergröße an den Inhalt anpassen.
  function fit() {
    const rect = stage.getBoundingClientRect();
    api.resizeWidget(Math.ceil(rect.width), Math.ceil(rect.height));
  }

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'settings') api.openSettings();
    if (btn.dataset.act === 'refresh') {
      btn.classList.add('is-spinning');
      try {
        state = await api.refresh();
      } finally {
        render();
      }
    }
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.widgetMenu();
  });

  // Strg + Mausrad ändert die Größe des Widgets.
  let wheelTimer;
  window.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey || !cfg) return;
      e.preventDefault();
      cfg.scale = Math.max(60, Math.min(200, cfg.scale + (e.deltaY < 0 ? 5 : -5)));
      render();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => api.setConfig({ scale: cfg.scale }), 250);
    },
    { passive: false }
  );

  api.onDevices((s) => {
    state = s;
    render();
  });
  api.onConfig((c) => {
    cfg = c;
    render();
  });
  api.onWallpaper((w) => {
    wallpaper = w;
    render();
  });
  api.onWidgetGeo((g) => {
    geo = g;
    glass();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  // "vor x Min." aktuell halten
  setInterval(render, 30000);
  new ResizeObserver(() => {
    fit();
    glass();
  }).observe(stage);

  api.getState().then((s) => {
    cfg = s.config;
    state = { devices: s.devices, receivers: s.receivers, error: s.error, at: s.at };
    wallpaper = s.wallpaper;
    geo = s.widgetGeo;
    render();
  });
})();
