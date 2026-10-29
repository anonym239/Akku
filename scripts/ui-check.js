'use strict';

// Startet die App im Demo-Modus, klickt alle Seiten in beiden Designs durch,
// speichert Screenshots in screenshots/check/ und prüft auf Fehler.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'screenshots', 'check');
fs.rmSync(out, { recursive: true, force: true });
const electron = require('electron');
const args = ['.', '--demo'];
if (process.platform === 'linux') args.push('--no-sandbox');
const cmd = process.platform === 'linux' && !process.env.DISPLAY ? 'xvfb-run' : electron;
const cmdArgs = cmd === 'xvfb-run' ? ['-a', '-s', '-screen 0 1600x1000x24', electron, ...args] : args;

spawnSync(cmd, cmdArgs, {
  cwd: root,
  stdio: 'ignore',
  timeout: 180000,
  env: { ...process.env, AKKU_SMOKE_DIR: out, AKKU_SMOKE_FULL: '1', AKKU_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'akku-ui-')) },
});

const reportFile = path.join(out, 'report.json');
if (!fs.existsSync(reportFile)) {
  console.error('Kein Bericht – die App ist nicht korrekt gestartet.');
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const problems = [];
if (report.devices < 1) problems.push('Keine Demo-Geräte geladen');
for (const [name, w] of Object.entries(report.windows)) {
  if (!w.visible) problems.push(`${name}: Fenster nicht sichtbar`);
  for (const e of [...w.errors, ...(w.errorsAfter || [])]) problems.push(`${name}: JS-Fehler ${e}`);
}
for (const [name, v] of Object.entries(report.layout)) {
  for (const issue of Array.isArray(v) ? v : v.issues) problems.push(`${name}: ${issue}`);
}
for (const [name, ok] of Object.entries(report.interactions || {})) {
  if (!ok) problems.push(`Bedienung fehlgeschlagen: ${name}`);
}
if (!report.interactions) problems.push('Bedienungstest fehlt');
if (problems.length) {
  console.error('Probleme gefunden:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`UI-Prüfung bestanden: ${Object.keys(report.layout).length} Ansichten ohne Stilfehler, ${Object.keys(report.interactions).length} Bedienschritte ok (${Object.keys(report.interactions).join(', ')}).`);
