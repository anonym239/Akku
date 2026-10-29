'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Startet das Widget mit der Anmeldung. Windows/macOS nutzen die
// eingebaute Electron-Funktion, Linux eine .desktop-Datei.
function linuxFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'autostart', 'akku-widget.desktop');
}

function setAutostart(app, enabled) {
  if (!app.isPackaged && !process.env.AKKU_FORCE_AUTOSTART) return; // Im Entwicklungsmodus nichts eintragen.
  try {
    if (process.platform === 'linux') {
      const file = linuxFile();
      if (enabled) {
        const exec = process.env.APPIMAGE || process.execPath;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(
          file,
          ['[Desktop Entry]', 'Type=Application', 'Name=Akku Widget', `Exec="${exec}" --autostart`, 'X-GNOME-Autostart-enabled=true', ''].join('\n')
        );
      } else if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      return;
    }
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--autostart'] });
  } catch (err) {
    console.error('Autostart konnte nicht gesetzt werden:', err);
  }
}

module.exports = { setAutostart };
