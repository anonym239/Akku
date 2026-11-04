'use strict';

(function () {
  const ICONS = window.AkkuIcons;
  const UI = window.AkkuUI;
  const api = window.akku;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const ACCENTS = ['#7c5cff', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899'];

  // Beispielgeräte für die Vorschau, solange keine echten erkannt werden.
  const SAMPLE = [
    { id: 's1', name: 'Maus', type: 'mouse', level: 78, charging: false, connected: true },
    { id: 's2', name: 'Tastatur', type: 'keyboard', level: 41, charging: false, connected: true },
    { id: 's3', name: 'Headset', type: 'headset', level: 12, charging: false, connected: true },
  ];

  const SOURCES = {
    win32:
      'Windows speichert den Akkustand gekoppelter Bluetooth-Geräte (auch Bluetooth LE) – dieselben Werte, die unter „Einstellungen › Bluetooth & Geräte“ stehen. Das Widget fragt sie im Hintergrund über PowerShell ab, ganz ohne Zusatzsoftware. Zusätzlich spricht das Widget direkt mit USB-Funkempfängern: Logitech (Unifying, Bolt, Lightspeed – auch per Kabel) und Razer (HyperSpeed). Andere Empfänger erscheinen unter „Geräte“, ihr Akku ist aber noch nicht lesbar.',
    linux: 'Unter Linux kommt der Akkustand von UPower. Dazu zählen Bluetooth-Geräte und viele Funkmäuse mit USB-Empfänger, z. B. Logitech Unifying/Bolt.',
    darwin: 'Unter macOS liest das Widget die Werte von ioreg (Bluetooth- und Apple-Geräte) und pmset (Akku des Macs).',
  };
  const PLATFORM = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' };

  // Vorlagen für einen schnellen Wechsel des Stils
  const PRESETS = {
    apple: { style: 'glass', layout: 'gauge', gaugeText: 'below', columns: 0, radius: 26, blur: 26, showHeader: false, showStatus: false, scale: 100 },
    clear: { style: 'transparent', layout: 'list', opacity: 0.12, radius: 22, showHeader: true, showStatus: true, width: 19, scale: 100, autoDesign: false },
    classic: { style: 'solid', layout: 'list', radius: 20, showHeader: true, showStatus: true, width: 19, scale: 100, autoDesign: false },
  };

  let cfg = null;
  let state = { devices: [], receivers: [], error: null, at: 0 };
  let wallpaper = null;

  // ---------------------------------------------------------- Icons & Fenster

  function injectIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      if (!el.firstElementChild) el.innerHTML = ICONS[el.dataset.icon] || '';
    });
  }

  $$('[data-win]').forEach((btn) => btn.addEventListener('click', () => api[btn.dataset.win]()));
  api.onMaximized((max) => {
    $('[data-win="maximize"]').title = max ? 'Verkleinern' : 'Maximieren';
  });

  let toastTimer;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 1800);
  }

  // ---------------------------------------------------------- Navigation

  function showPage(name) {
    $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.page === name));
    $$('.page').forEach((p) => p.classList.toggle('is-active', p.id === 'page-' + name));
    $('.content').scrollTop = 0;
  }
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));

  // ---------------------------------------------------------- Einstellungen speichern

  // Eigene Änderungen an Farbe/Tönung schalten das Auto-Design aus.
  function manual(partial, el) {
    if (el && el.closest('[data-manual]') && cfg.autoDesign) {
      toast('Auto-Design aus – deine Einstellung gilt');
      return { ...partial, autoDesign: false };
    }
    return partial;
  }

  async function save(partial, message) {
    cfg = await api.setConfig(partial);
    renderAll();
    if (message) toast(message);
  }

  $$('input[type="checkbox"][data-key]').forEach((input) => {
    input.addEventListener('change', () => save({ [input.dataset.key]: input.checked }));
  });

  $$('.segmented[data-key]').forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      const value = 'number' in group.dataset ? Number(btn.dataset.value) : btn.dataset.value;
      save(manual({ [group.dataset.key]: value }, group));
    });
  });

  $$('input[type="range"][data-key]').forEach((input) => {
    const scale = Number(input.dataset.scale || 1);
    input.addEventListener('input', () => {
      const value = Number(input.value) / scale;
      cfg[input.dataset.key] = value;
      updateRanges();
      renderPreview();
      renderThresholdDemo();
    });
    input.addEventListener('change', () => save(manual({ [input.dataset.key]: Number(input.value) / scale }, input)));
  });

  $$('select[data-key]').forEach((select) => {
    select.addEventListener('change', () => save({ [select.dataset.key]: Number(select.value) }, 'Gespeichert'));
  });

  function buildSwatches() {
    const box = $('#swatches');
    box.innerHTML =
      ACCENTS.map((c) => `<button class="swatch" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('') +
      `<label class="swatch custom" title="Eigene Farbe"><input type="color" id="customColor" /></label>`;
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-color]');
      if (btn) save(manual({ accent: btn.dataset.color }, box));
    });
    box.closest('.row').setAttribute('data-manual', '');
    $('#customColor').addEventListener('input', (e) => {
      document.documentElement.style.setProperty('--accent', e.target.value);
    });
    $('#customColor').addEventListener('change', (e) => save(manual({ accent: e.target.value }, box)));
  }

  $('#refreshBtn').addEventListener('click', async () => {
    const btn = $('#refreshBtn');
    btn.classList.add('is-busy');
    try {
      state = await api.refresh();
      renderDevices();
      renderPreview();
      toast('Akkustände aktualisiert');
    } finally {
      btn.classList.remove('is-busy');
    }
  });
  $('#presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (btn) save(PRESETS[btn.dataset.preset], 'Vorlage übernommen');
  });
  $('#testNotifyBtn').addEventListener('click', async () => {
    const ok = await api.testNotification();
    toast(ok ? 'Test-Benachrichtigung gesendet' : 'Benachrichtigungen werden hier nicht unterstützt');
  });
  $('#demoBtn').addEventListener('click', () => save({ demo: true }, 'Demo-Modus aktiviert'));
  $('#resetPosBtn').addEventListener('click', () => save({ widgetPos: null }, 'Widget oben rechts platziert'));
  $('#resetBtn').addEventListener('click', async () => {
    if (!confirm('Alle Einstellungen auf Standard zurücksetzen?')) return;
    cfg = await api.resetConfig();
    renderAll();
    toast('Einstellungen zurückgesetzt');
  });
  $('#githubBtn').addEventListener('click', () => api.openExternal('https://github.com/anonym239/Akku'));
  $('#quitBtn').addEventListener('click', () => api.quit());

  // ---------------------------------------------------------- Darstellung

  function syncControls() {
    $$('input[type="checkbox"][data-key]').forEach((input) => {
      input.checked = Boolean(cfg[input.dataset.key]);
    });
    $$('.segmented[data-key]').forEach((group) => {
      group.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b.dataset.value === String(cfg[group.dataset.key])));
    });
    // Zeilen nur zeigen, wenn sie zur Auswahl passen (data-when="layout=gauge,rings").
    $$('[data-when]').forEach((row) => {
      const [key, values] = row.dataset.when.split('=');
      row.hidden = !values.split(',').includes(String(cfg[key]));
    });
    renderAutoResult();
    $$('select[data-key]').forEach((select) => {
      const value = String(cfg[select.dataset.key]);
      if (![...select.options].some((o) => o.value === value)) {
        select.add(new Option(`${value} Sekunden`, value));
      }
      select.value = value;
    });
    $$('.swatch[data-color]').forEach((s) => s.classList.toggle('is-active', s.dataset.color === cfg.accent));
    const custom = !ACCENTS.includes(cfg.accent);
    const customEl = $('.swatch.custom');
    customEl.classList.toggle('is-active', custom);
    customEl.style.setProperty('--c', cfg.accent);
    $('#customColor').value = cfg.accent;
    $('#widgetStateText').textContent = cfg.showWidget ? 'wird angezeigt' : 'ausgeblendet';
    updateRanges();
  }

  function updateRanges() {
    $$('input[type="range"][data-key]').forEach((input) => {
      const scale = Number(input.dataset.scale || 1);
      input.value = Math.round(cfg[input.dataset.key] * scale);
      const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty('--fill', pct + '%');
    });
    $$('output[data-out]').forEach((out) => {
      const v = cfg[out.dataset.out] * Number(out.dataset.scale || 1) * Number(out.dataset.mult || 1);
      out.textContent = Math.round(v) + (out.dataset.suffix || '');
    });
    $('#thresholdOut').textContent = cfg.lowThreshold + ' %';
  }

  function chipText(d) {
    if (d.charging) return d.level >= 100 ? 'Voll geladen' : 'Lädt';
    if (!d.connected) return 'Getrennt';
    if (d.level <= cfg.lowThreshold) return 'Bitte aufladen';
    return 'Verbunden';
  }

  function deviceHtml(d) {
    const hidden = cfg.hidden.includes(d.id);
    const tone = d.charging ? 'charge' : UI.levelTone(d.level, cfg.lowThreshold);
    const name = cfg.names[d.id] || d.name;
    const sub = [UI.TYPE_LABEL[d.type] || 'Gerät', d.source].filter(Boolean).join(' · ');
    return `
      <article class="device tone-${tone}${hidden ? ' is-hidden' : ''}" data-id="${UI.esc(d.id)}">
        <div class="device-top">
          <div class="device-ico">${UI.deviceIcon(d.type)}</div>
          <div class="device-main">
            <input class="name-input" value="${UI.esc(name)}" placeholder="${UI.esc(d.name)}" maxlength="40" spellcheck="false" title="Zum Umbenennen klicken" />
            <div class="device-sub">${UI.esc(sub)}</div>
          </div>
          <div class="device-pct">${d.level}<small>%</small></div>
        </div>
        <div class="device-bar"><span style="width:${Math.max(2, d.level)}%"></span></div>
        <div class="device-foot">
          <span class="chip">${UI.esc(chipText(d))}</span>
          <label class="visibility">Im Widget<span class="switch"><input type="checkbox" class="vis-toggle" ${hidden ? '' : 'checked'} /><i></i></span></label>
        </div>
      </article>`;
  }

  function renderDevices() {
    const list = $('#deviceList');
    const devices = state.devices || [];
    // Laufende Namensänderung nicht überschreiben.
    if (!list.contains(document.activeElement) || document.activeElement.className !== 'name-input') {
      list.innerHTML = devices.map(deviceHtml).join('');
    }
    const empty = devices.length === 0;
    $('#emptyBox').hidden = !empty || Boolean(state.error);
    $('#demoBtn').hidden = cfg.demo;
    $('#errorBox').hidden = !state.error;
    $('#errorText').textContent = state.error || '';

    const visible = UI.visibleDevices(devices, cfg);
    $('#statCount').textContent = String(devices.length);
    const lowest = visible.slice().sort((a, b) => a.level - b.level)[0];
    $('#statLowest').textContent = lowest ? `${lowest.level} %` : '–';
    $('#statLowest').title = lowest ? lowest.name : '';
    $('#statUpdated').textContent = state.at ? UI.relTime(state.at) : '–';
  }

  $('#deviceList').addEventListener('change', (e) => {
    const card = e.target.closest('.device');
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.classList.contains('vis-toggle')) {
      const hidden = new Set(cfg.hidden);
      e.target.checked ? hidden.delete(id) : hidden.add(id);
      save({ hidden: [...hidden] });
    } else if (e.target.classList.contains('name-input')) {
      const names = { ...cfg.names };
      const original = (state.devices.find((d) => d.id === id) || {}).name;
      const value = e.target.value.trim();
      if (!value || value === original) delete names[id];
      else names[id] = value;
      e.target.blur();
      save({ names }, 'Name gespeichert');
    }
  });
  $('#deviceList').addEventListener('keydown', (e) => {
    if (e.target.classList.contains('name-input') && e.key === 'Enter') e.target.blur();
    if (e.target.classList.contains('name-input') && e.key === 'Escape') {
      const card = e.target.closest('.device');
      const d = state.devices.find((x) => x.id === card.dataset.id);
      e.target.value = cfg.names[d.id] || d.name;
      e.target.blur();
    }
  });

  function renderPreview() {
    const card = $('#previewCard');
    const stage = $('#previewStage');
    const real = UI.visibleDevices(state.devices, cfg).length > 0;
    const previewState = real ? state : { devices: SAMPLE, error: null, at: Date.now() };
    const previewCfg = real ? cfg : { ...cfg, hidden: [], names: {} };
    const hasWall = Boolean(wallpaper && wallpaper.url);
    UI.applyCardStyle(card, previewCfg, { hasWallpaper: hasWall });
    card.innerHTML = UI.widgetHtml(previewState, previewCfg);
    // Die Vorschau zeigt dein echtes Hintergrundbild, das Glas den Ausschnitt dahinter.
    stage.classList.toggle('has-wallpaper', hasWall);
    if (!hasWall) {
      stage.style.backgroundImage = '';
      return;
    }
    const wall = { ...wallpaper, fit: 'fill' };
    const a = stage.getBoundingClientRect();
    const area = { x: a.left, y: a.top, width: a.width, height: a.height, scaleFactor: 1 };
    const p = UI.wallpaperPlacement(wall, area);
    stage.style.backgroundImage = `url("${wallpaper.url}")`;
    stage.style.backgroundSize = `${p.w}px ${p.h}px`;
    stage.style.backgroundPosition = `${p.x - a.left}px ${p.y - a.top}px`;
    const r = card.getBoundingClientRect();
    UI.placeGlass(card, wall, area, { left: r.left, top: r.top });
  }

  function renderAutoResult() {
    const el = $('#autoResult');
    el.hidden = !cfg.autoDesign;
    if (!cfg.autoDesign) return;
    const tone = cfg.widgetTone === 'light' ? 'Hell' : cfg.widgetTone === 'dark' ? 'Dunkel' : 'Wie Design';
    const style = { glass: 'Glas', transparent: 'Durchsichtig', solid: 'Einfarbig' }[cfg.style];
    const found = wallpaper && wallpaper.url;
    el.innerHTML = `
      <div class="auto-chips">
        <span class="auto-chip"><i class="dot" style="background:${UI.esc(cfg.accent)}"></i>Akzent</span>
        <span class="auto-chip">${tone}</span>
        <span class="auto-chip">${style}</span>
        <span class="auto-chip">Tönung ${Math.round(cfg.opacity * 100)} %</span>
        <span class="auto-chip">Unschärfe ${cfg.blur} px</span>
      </div>
      <small>${found ? 'Passend zum Bildausschnitt hinter dem Widget gewählt. Verschiebst du das Widget oder wechselst du das Hintergrundbild, passt es sich neu an.' : 'Kein Hintergrundbild gefunden – das Widget folgt dem Systemdesign.'}</small>`;
  }

  function renderReceivers() {
    const list = state.receivers || [];
    $('#receiversBox').hidden = list.length === 0;
    const text = {
      ok: (r) => `Akku wird gelesen${r.count ? ` (${r.count} ${r.count === 1 ? 'Gerät' : 'Geräte'})` : ''}`,
      offline: () => 'Gerät aus oder im Schlafmodus',
      empty: () => 'Erkannt, aber kein eingeschaltetes Gerät',
      error: (r) => `Kein Zugriff: ${r.message || 'unbekannter Fehler'}`,
      unsupported: (r) => `Akku nicht lesbar (ID ${r.vid}:${r.pid})`,
    };
    const tone = { ok: 'good', offline: 'warn', empty: 'warn', error: 'bad', unsupported: 'muted' };
    $('#receiverList').innerHTML = list
      .map(
        (r) => `
        <div class="row receiver tone-${tone[r.status] || 'muted'}">
          <div class="device-ico small">${ICONS.other}</div>
          <div class="row-text"><strong>${UI.esc(r.name)}</strong><small>${UI.esc(r.vendor)} · ${r.kind === 'receiver' ? 'USB-Empfänger' : 'USB-Gerät'}</small></div>
          <span class="chip">${UI.esc((text[r.status] || text.empty)(r))}</span>
        </div>`
      )
      .join('');
  }

  function renderThresholdDemo() {
    const t = cfg.lowThreshold;
    const rows = [
      ['good', 'Gut', `über ${Math.max(40, t + 15)} %`, 80],
      ['warn', 'Mittel', `${t + 1} – ${Math.max(40, t + 15)} %`, Math.max(40, t + 15) - 5],
      ['bad', 'Bitte aufladen', `bis ${t} %`, t],
    ];
    $('#thresholdDemo').innerHTML = rows
      .map(
        ([tone, title, range, level]) => `
        <div class="tone tone-${tone}">
          <strong>${title}</strong>
          <div class="device-bar"><span style="width:${level}%"></span></div>
          <small>${range}</small>
        </div>`
      )
      .join('');
  }

  function renderAbout(s) {
    $('#version').textContent = s.version;
    $('#platform').textContent = PLATFORM[s.platform] || s.platform;
    $('#sourceText').textContent = SOURCES[s.platform] || SOURCES.linux;
    if (s.platform !== 'win32') {
      $('#emptyHint').textContent = 'Koppel deine Maus, Tastatur oder dein Headset. Sobald das System den Akkustand kennt, erscheint das Gerät hier automatisch.';
    }
  }

  function renderAll() {
    if (!cfg) return;
    UI.applyTheme(cfg);
    syncControls();
    renderDevices();
    renderReceivers();
    renderPreview();
    renderThresholdDemo();
  }

  // ---------------------------------------------------------- Start

  injectIcons();
  buildSwatches();

  api.onDevices((s) => {
    state = s;
    renderDevices();
    renderReceivers();
    renderPreview();
  });
  api.onWallpaper((w) => {
    wallpaper = w;
    renderPreview();
    renderAutoResult();
  });
  window.addEventListener('resize', () => cfg && renderPreview());
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => cfg && requestAnimationFrame(renderPreview)));
  api.onConfig((c) => {
    cfg = c;
    renderAll();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => cfg && renderAll());
  setInterval(() => cfg && renderDevices(), 30000);

  api.getState().then((s) => {
    cfg = s.config;
    state = { devices: s.devices, receivers: s.receivers, error: s.error, at: s.at };
    wallpaper = s.wallpaper;
    renderAbout(s);
    renderAll();
  });
})();
