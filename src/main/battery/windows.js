'use strict';

const { execFile } = require('child_process');
const { classify } = require('./classify');

// Windows speichert den Akkustand gekoppelter Bluetooth-Geräte (klassisch und
// Bluetooth LE / HID) als PnP-Geräteeigenschaft. Dieselbe Quelle nutzt auch
// die Windows-Einstellungsseite "Bluetooth & Geräte".
const BATTERY_KEY = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2';
const CONNECTED_KEY = '{83DA6326-97A6-4088-9453-A1923F573B29} 15';

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$bt = @()
$devs = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'BTH*' })
if ($devs.Count -gt 0) {
  $props = @($devs | Get-PnpDeviceProperty -KeyName '${BATTERY_KEY}','${CONNECTED_KEY}')
  foreach ($d in $devs) {
    $mine = $props | Where-Object { $_.InstanceId -eq $d.InstanceId }
    $b = $mine | Where-Object { $_.KeyName -eq '${BATTERY_KEY}' } | Select-Object -First 1
    if ($b -and $null -ne $b.Data -and "$($b.Type)" -ne 'Empty') {
      $c = $mine | Where-Object { $_.KeyName -eq '${CONNECTED_KEY}' } | Select-Object -First 1
      $conn = $null
      if ($c -and $null -ne $c.Data -and "$($c.Type)" -ne 'Empty') { $conn = [bool]$c.Data }
      $bt += [pscustomobject]@{ id = $d.InstanceId; name = $d.FriendlyName; cls = "$($d.Class)"; status = "$($d.Status)"; battery = [int]$b.Data; connected = $conn }
    }
  }
}
$sys = @()
foreach ($b in @(Get-CimInstance -ClassName Win32_Battery)) {
  $sys += [pscustomobject]@{ id = "$($b.DeviceID)"; name = "$($b.Name)"; battery = [int]$b.EstimatedChargeRemaining; status = [int]$b.BatteryStatus }
}
ConvertTo-Json -Compress -Depth 4 -InputObject ([pscustomobject]@{ bt = @($bt); sys = @($sys) })
`;

function runPowerShell(script, timeoutMs = 20000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      }
    );
  });
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Ein Gerät taucht unter Windows oft mehrfach auf (Gerät + Dienste wie
// "Hands-Free AG"). Wir behalten pro Name einen Eintrag.
function cleanName(name) {
  return String(name || '')
    .replace(/\s+(Hands-Free( AG)?|Avrcp Transport|Stereo|A2DP SNK|AVRCP|LE)(\s+Audio)?$/i, '')
    .trim();
}

function parseWindowsOutput(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return [];
  const data = JSON.parse(text.slice(text.indexOf('{')));
  const byName = new Map();

  for (const d of asArray(data.bt)) {
    const level = Number(d.battery);
    if (!Number.isFinite(level) || level < 0 || level > 100) continue;
    const name = cleanName(d.name) || 'Bluetooth-Gerät';
    // Mehrere Knoten eines Geräts haben dieselbe Bluetooth-Adresse im Pfad.
    const addr = (String(d.id).match(/([0-9A-F]{12})(?!.*[0-9A-F]{12})/i) || [])[1];
    const key = (addr ? addr.toUpperCase() : name.toLowerCase());
    const connected = d.connected === null || d.connected === undefined ? d.status === 'OK' : Boolean(d.connected);
    const prev = byName.get(key);
    if (prev) {
      prev.connected = prev.connected || connected;
      if (name.length < prev.name.length) prev.name = name;
      continue;
    }
    byName.set(key, {
      id: 'win-bt-' + key,
      name,
      type: classify(name),
      level,
      charging: false,
      connected,
      source: 'Bluetooth',
    });
  }

  const devices = [...byName.values()];
  asArray(data.sys).forEach((b, i) => {
    const level = Number(b.battery);
    if (!Number.isFinite(level)) return;
    // BatteryStatus: 2 = Netzbetrieb, 6-9 = lädt
    const status = Number(b.status);
    devices.push({
      id: 'win-sys-' + (b.id || i),
      name: 'Dieser PC',
      type: 'system',
      level: Math.max(0, Math.min(100, level)),
      charging: status === 2 || (status >= 6 && status <= 9),
      connected: true,
      source: 'System',
    });
  });
  return devices;
}

async function getDevices() {
  const out = await runPowerShell(SCRIPT);
  return parseWindowsOutput(out);
}

module.exports = { getDevices, parseWindowsOutput, cleanName, SCRIPT };
