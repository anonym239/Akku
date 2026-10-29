'use strict';

(function () {
  const { widgetHtml, applyCardStyle, applyTheme } = window.AkkuUI;
  const api = window.akku;
  const card = document.getElementById('card');
  const stage = document.querySelector('.stage');

  let cfg = null;
  let state = { devices: [], error: null, at: 0 };

  function render() {
    if (!cfg) return;
    applyTheme(cfg);
    applyCardStyle(card, cfg);
    card.innerHTML = widgetHtml(state, cfg);
    fit();
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

  api.onDevices((s) => {
    state = s;
    render();
  });
  api.onConfig((c) => {
    cfg = c;
    render();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  // "vor x Min." aktuell halten
  setInterval(render, 30000);
  new ResizeObserver(fit).observe(stage);

  api.getState().then((s) => {
    cfg = s.config;
    state = { devices: s.devices, error: s.error, at: s.at };
    render();
  });
})();
