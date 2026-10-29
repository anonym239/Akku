'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, screen, nativeTheme, shell } = require('electron');
const { Store } = require('./store');
const { readDevices } = require('./battery');
const { setAutostart } = require('./autostart');

const APP_ID = 'com.anonym239.akkuwidget';
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const RENDERER = path.join(__dirname, '..', 'renderer');
const SMOKE_DIR = process.env.AKKU_SMOKE_DIR || null; // nur für automatische Tests

if (process.env.AKKU_USER_DATA) app.setPath('userData', process.env.AKKU_USER_DATA);

const launchedByAutostart = process.argv.includes('--autostart') || app.getLoginItemSettings().wasOpenedAtLogin;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openSettings());
}

let store;
let tray = null;
let widgetWin = null;
let settingsWin = null;
let pollTimer = null;
let polling = false;
let quitting = false;
let state = { devices: [], error: null, at: 0 };
const warned = new Set();

// ---------------------------------------------------------------- Hilfen

function icon(name) {
  return nativeImage.createFromPath(path.join(ASSETS, name));
}

function broadcast(channel, payload) {
  for (const win of [widgetWin, settingsWin]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function publicState() {
  return {
    config: store.get(),
    ...state,
    platform: process.platform,
    version: app.getVersion(),
  };
}

function displayName(device) {
  return store.get().names[device.id] || device.name;
}

// ---------------------------------------------------------------- Akkus lesen

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const cfg = store.get();
    state = await readDevices({ demo: cfg.demo });
    broadcast('devices', state);
    checkLowBattery();
  } finally {
    polling = false;
  }
}

function schedulePolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, store.get().refreshSec * 1000);
}

function checkLowBattery() {
  const cfg = store.get();
  for (const d of state.devices) {
    if (cfg.hidden.includes(d.id)) continue;
    const low = d.level <= cfg.lowThreshold && !d.charging && d.connected;
    if (low && !warned.has(d.id)) {
      warned.add(d.id);
      if (cfg.notifyLow && Notification.isSupported()) {
        new Notification({
          title: `Akku fast leer: ${displayName(d)}`,
          body: `Nur noch ${d.level} % – bitte bald aufladen.`,
          icon: path.join(ASSETS, 'icon.png'),
          silent: false,
        }).show();
      }
    } else if (d.level > cfg.lowThreshold + 5 || d.charging) {
      warned.delete(d.id);
    }
  }
}

// ---------------------------------------------------------------- Widget

function defaultWidgetPos(width) {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - width - 24, y: area.y + 24 };
}

function clampToScreen(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  return {
    ...bounds,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height),
  };
}

function createWidget() {
  const cfg = store.get();
  const width = 300;
  const height = 220;
  const pos = cfg.widgetPos || defaultWidgetPos(width);

  widgetWin = new BrowserWindow({
    ...clampToScreen({ ...pos, width, height }),
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: cfg.alwaysOnTop,
    movable: !cfg.locked,
    title: 'Akku Widget',
    icon: path.join(ASSETS, 'icon.png'),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  widgetWin.setVisibleOnAllWorkspaces(true);
  widgetWin.loadFile(path.join(RENDERER, 'widget.html'));
  widgetWin.once('ready-to-show', () => {
    if (store.get().showWidget) widgetWin.showInactive();
  });

  let moveTimer;
  widgetWin.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!widgetWin || widgetWin.isDestroyed()) return;
      const [x, y] = widgetWin.getPosition();
      store.set({ widgetPos: { x, y } });
    }, 300);
  });

  // Unter Windows öffnet ein Rechtsklick auf Zieh-Bereiche sonst das Systemmenü.
  widgetWin.on('system-context-menu', (event) => {
    event.preventDefault();
    showWidgetMenu();
  });

  widgetWin.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      setConfig({ showWidget: false });
    }
  });
}

function showWidgetMenu() {
  const cfg = store.get();
  Menu.buildFromTemplate([
    { label: 'Aktualisieren', click: () => poll() },
    { label: 'Einstellungen …', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Position sperren', type: 'checkbox', checked: cfg.locked, click: (i) => setConfig({ locked: i.checked }) },
    { label: 'Immer im Vordergrund', type: 'checkbox', checked: cfg.alwaysOnTop, click: (i) => setConfig({ alwaysOnTop: i.checked }) },
    { label: 'Widget ausblenden', click: () => setConfig({ showWidget: false }) },
    { type: 'separator' },
    { label: 'Beenden', click: () => quit() },
  ]).popup({ window: widgetWin });
}

// ---------------------------------------------------------------- Einstellungen

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 940,
    height: 660,
    minWidth: 780,
    minHeight: 560,
    frame: false,
    show: false,
    title: 'Akku Widget – Einstellungen',
    icon: path.join(ASSETS, 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14151c' : '#f4f5fa',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWin.loadFile(path.join(RENDERER, 'settings.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('maximize', () => settingsWin.webContents.send('maximized', true));
  settingsWin.on('unmaximize', () => settingsWin.webContents.send('maximized', false));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

// ---------------------------------------------------------------- Konfiguration

function applyConfig(changed) {
  const cfg = store.get();
  if ('theme' in changed) nativeTheme.themeSource = cfg.theme === 'auto' ? 'system' : cfg.theme;
  if (widgetWin && !widgetWin.isDestroyed()) {
    if ('alwaysOnTop' in changed) widgetWin.setAlwaysOnTop(cfg.alwaysOnTop);
    if ('locked' in changed) widgetWin.setMovable(!cfg.locked);
    if ('showWidget' in changed) cfg.showWidget ? widgetWin.showInactive() : widgetWin.hide();
    if ('widgetPos' in changed && cfg.widgetPos === null) {
      const [w, h] = widgetWin.getSize();
      widgetWin.setBounds(clampToScreen({ ...defaultWidgetPos(w), width: w, height: h }));
    }
  }
  if ('autostart' in changed) setAutostart(app, cfg.autostart);
  if ('refreshSec' in changed) schedulePolling();
  if ('lowThreshold' in changed) warned.clear();
  if ('demo' in changed) poll();
  updateTrayMenu();
}

function setConfig(partial) {
  const changed = store.set(partial);
  applyConfig(changed);
  broadcast('config', store.get());
  return store.get();
}

// ---------------------------------------------------------------- Tray

function createTray() {
  tray = new Tray(icon(process.platform === 'win32' ? 'tray.png' : 'tray@2x.png').resize({ width: 16, height: 16 }));
  tray.setToolTip('Akku Widget');
  tray.on('click', () => openSettings());
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const cfg = store.get();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Einstellungen öffnen', click: () => openSettings() },
      { label: 'Widget anzeigen', type: 'checkbox', checked: cfg.showWidget, click: (i) => setConfig({ showWidget: i.checked }) },
      { label: 'Jetzt aktualisieren', click: () => poll() },
      { type: 'separator' },
      { label: 'Beenden', click: () => quit() },
    ])
  );
}

function quit() {
  quitting = true;
  app.quit();
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.handle('state:get', () => publicState());
  ipcMain.handle('config:set', (_e, partial) => setConfig(partial));
  ipcMain.handle('config:reset', () => {
    store.reset();
    applyConfig({ theme: 1, alwaysOnTop: 1, locked: 1, showWidget: 1, autostart: 1, refreshSec: 1, lowThreshold: 1, demo: 1 });
    broadcast('config', store.get());
    return store.get();
  });
  ipcMain.handle('devices:refresh', async () => {
    await poll();
    return state;
  });

  ipcMain.on('widget:resize', (_e, size) => {
    if (!widgetWin || widgetWin.isDestroyed()) return;
    const width = Math.round(Math.min(900, Math.max(120, Number(size && size.width) || 300)));
    const height = Math.round(Math.min(1200, Math.max(60, Number(size && size.height) || 200)));
    const [x, y] = widgetWin.getPosition();
    const [w, h] = widgetWin.getSize();
    if (w === width && h === height) return;
    widgetWin.setBounds(clampToScreen({ x, y, width, height }));
  });
  ipcMain.on('widget:menu', () => showWidgetMenu());
  ipcMain.on('settings:open', () => openSettings());
  ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('win:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on('app:quit', () => quit());
  ipcMain.on('open:external', (_e, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
  });
}

// ---------------------------------------------------------------- Selbsttest (CI)

async function smokeTest() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (win, name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SMOKE_DIR, `${name}.png`), img.toPNG());
  };
  // Sucht Elemente, deren Text abgeschnitten wird oder aus dem Fenster ragt.
  const LAYOUT_CHECK = `(() => {
    const issues = [];
    const vw = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || el.closest('[hidden]') || el.closest('.page:not(.is-active)')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 1 && !el.closest('.content')) issues.push('ragt raus: ' + el.className);
      if (el.closest('.content') && r.right > document.querySelector('.content').getBoundingClientRect().right + 1) issues.push('ragt raus: ' + el.className);
      const clipsText = el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible';
      if (clipsText) issues.push('abgeschnitten: ' + el.className + ' "' + el.textContent.trim() + '"');
    }
    // Text und Bedienelement einer Zeile dürfen sich nicht überlappen,
    // und nichts darf über den Rand seiner Karte hinausragen.
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const row of document.querySelectorAll('.page.is-active .row, .w-row, .w-line, .w-head')) {
      const kids = [...row.children].filter((k) => getComputedStyle(k).display !== 'none');
      for (let i = 0; i < kids.length; i++)
        for (let j = i + 1; j < kids.length; j++)
          if (hit(kids[i].getBoundingClientRect(), kids[j].getBoundingClientRect())) issues.push('überlappt: ' + kids[i].className + ' / ' + kids[j].className);
    }
    for (const card of document.querySelectorAll('.page.is-active .card, .page.is-active .stat, .page.is-active .device, .w-card')) {
      const c = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > c.right + 1 || r.left < c.left - 1)) issues.push('ragt aus Karte: ' + el.className);
      }
    }
    for (const img of document.querySelectorAll('img')) {
      if (!img.complete || img.naturalWidth === 0) issues.push('Bild fehlt: ' + img.getAttribute('src'));
    }
    for (const t of document.querySelectorAll('.page.is-active .row-text')) {
      if (t.getBoundingClientRect().width < 120) issues.push('zu schmal: ' + t.textContent.trim().slice(0, 30));
    }
    return [...new Set(issues)];
  })()`;

  await wait(2500);
  fs.mkdirSync(SMOKE_DIR, { recursive: true });
  const report = { devices: state.devices.length, error: state.error, windows: {}, layout: {} };
  for (const [name, win] of [['widget', widgetWin], ['settings', settingsWin]]) {
    if (!win || win.isDestroyed()) continue;
    await shot(win, name);
    const errors = await win.webContents.executeJavaScript('window.__errors || []');
    report.windows[name] = { bounds: win.getBounds(), visible: win.isVisible(), errors };
  }

  if (process.env.AKKU_SMOKE_FULL) {
    for (const theme of ['dark', 'light']) {
      setConfig({ theme });
      for (const [w, h] of [[780, 560], [940, 660], [1320, 840]]) {
        settingsWin.setSize(w, h);
        for (const page of ['devices', 'look', 'behavior', 'alerts', 'about']) {
          await settingsWin.webContents.executeJavaScript(`document.querySelector('[data-page="${page}"]').click()`);
          await wait(400);
          await shot(settingsWin, `settings-${theme}-${w}-${page}`);
          report.layout[`${theme}-${w}-${page}`] = await settingsWin.webContents.executeJavaScript(LAYOUT_CHECK);
        }
      }
      settingsWin.setSize(940, 660);
      for (const layout of ['list', 'rings']) {
        for (const size of ['compact', 'large']) {
          setConfig({ layout, size });
          await wait(600);
          await shot(widgetWin, `widget-${theme}-${layout}-${size}`);
          report.layout[`widget-${theme}-${layout}-${size}`] = {
            bounds: widgetWin.getBounds(),
            issues: await widgetWin.webContents.executeJavaScript(LAYOUT_CHECK),
          };
        }
      }
      setConfig({ layout: 'list', size: 'normal' });
    }
    // Bedienung wie ein Mensch: im Einstellungsfenster klicken und prüfen,
    // ob Widget und gespeicherte Einstellungen reagieren.
    const sJs = (code) => settingsWin.webContents.executeJavaScript(code);
    const wJs = (code) => widgetWin.webContents.executeJavaScript(code);
    const checks = {};
    await sJs(`document.querySelector('[data-page="look"]').click()`);
    await sJs(`document.querySelector('.segmented[data-key="layout"] [data-value="rings"]').click()`);
    await wait(500);
    checks.layoutRinge = store.get().layout === 'rings' && (await wJs(`!!document.querySelector('.w-grid')`));
    await sJs(`document.querySelector('.segmented[data-key="layout"] [data-value="list"]').click()`);
    await wait(500);
    checks.layoutListe = (await wJs(`document.querySelectorAll('.w-row').length`)) === state.devices.length;
    await sJs(`document.querySelector('.swatch[data-color="#10b981"]').click()`);
    await wait(300);
    checks.akzentfarbe = store.get().accent === '#10b981' && (await wJs(`document.documentElement.style.getPropertyValue('--accent')`)) === '#10b981';
    await sJs(`document.querySelector('[data-page="devices"]').click()`);
    await sJs(`(() => { const t = document.querySelector('.vis-toggle'); t.click(); })()`);
    await wait(500);
    checks.geraetAusblenden = store.get().hidden.length === 1 && (await wJs(`document.querySelectorAll('.w-row').length`)) === state.devices.length - 1;
    await sJs(`document.querySelector('.vis-toggle').click()`);
    await wait(400);
    checks.geraetEinblenden = store.get().hidden.length === 0;
    await sJs(`(() => { const i = document.querySelectorAll('.name-input')[1]; i.focus(); i.value = 'Meine Tastatur'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await wait(500);
    checks.umbenennen = (await wJs(`document.body.textContent.includes('Meine Tastatur')`)) && Object.values(store.get().names).includes('Meine Tastatur');
    await sJs(`document.querySelector('.widget-toggle input').click()`);
    await wait(400);
    checks.widgetAusblenden = !widgetWin.isVisible();
    await sJs(`document.querySelector('.widget-toggle input').click()`);
    await wait(400);
    checks.widgetEinblenden = widgetWin.isVisible();
    await sJs(`document.querySelector('[data-page="behavior"]').click()`);
    await sJs(`document.querySelector('[data-key="alwaysOnTop"]').click()`);
    await wait(300);
    checks.immerVorne = widgetWin.isAlwaysOnTop() === true;
    await sJs(`document.querySelector('[data-key="alwaysOnTop"]').click()`);
    await sJs(`(() => { const s = document.querySelector('[data-key="refreshSec"]'); s.value = '30'; s.dispatchEvent(new Event('change')); })()`);
    await wait(300);
    checks.intervall = store.get().refreshSec === 30;
    await sJs(`document.querySelector('[data-page="alerts"]').click()`);
    await sJs(`(() => { const r = document.querySelector('[data-key="lowThreshold"]'); r.value = '30'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); })()`);
    await wait(300);
    checks.warnschwelle = store.get().lowThreshold === 30 && (await sJs(`document.getElementById('thresholdOut').textContent`)) === '30 %';
    widgetWin.setPosition(200, 300);
    await wait(800);
    checks.positionGespeichert = JSON.stringify(store.get().widgetPos) === JSON.stringify({ x: 200, y: 300 });
    await wJs(`document.querySelector('[data-act="refresh"]').click()`);
    await wait(800);
    checks.widgetAktualisieren = (await wJs(`window.__errors.length`)) === 0;
    const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'einstellungen.json'), 'utf8'));
    checks.dateiGespeichert = saved.accent === '#10b981' && saved.refreshSec === 30;
    report.interactions = checks;

    // Leerer Zustand ohne Geräte
    setConfig({ demo: false, theme: 'dark' });
    await wait(1500);
    await shot(widgetWin, 'widget-empty');
    await settingsWin.webContents.executeJavaScript(`document.querySelector('[data-page="devices"]').click()`);
    await wait(400);
    await shot(settingsWin, 'settings-empty');
    for (const [name, win] of [['widget', widgetWin], ['settings', settingsWin]]) {
      report.windows[name].errorsAfter = await win.webContents.executeJavaScript('window.__errors || []');
    }
  }
  fs.writeFileSync(path.join(SMOKE_DIR, 'report.json'), JSON.stringify(report, null, 2));
  quit();
}

// ---------------------------------------------------------------- Start

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(icon('icon.png'));

  store = new Store(app.getPath('userData'));
  if (process.argv.includes('--demo')) store.set({ demo: true });
  const cfg = store.get();
  nativeTheme.themeSource = cfg.theme === 'auto' ? 'system' : cfg.theme;
  setAutostart(app, cfg.autostart);

  registerIpc();
  createTray();
  createWidget();
  if (!launchedByAutostart && (cfg.openSettingsOnStart || SMOKE_DIR)) openSettings();

  nativeTheme.on('updated', () => broadcast('config', store.get()));
  poll();
  schedulePolling();

  if (SMOKE_DIR) smokeTest();
});

// Das Widget läuft im Infobereich weiter, auch wenn kein Fenster offen ist.
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  quitting = true;
  clearInterval(pollTimer);
});
