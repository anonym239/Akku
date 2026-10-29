'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('akku', {
  getState: () => ipcRenderer.invoke('state:get'),
  setConfig: (partial) => ipcRenderer.invoke('config:set', partial),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  refresh: () => ipcRenderer.invoke('devices:refresh'),
  onDevices: (cb) => listen('devices', cb),
  onConfig: (cb) => listen('config', cb),
  onMaximized: (cb) => listen('maximized', cb),
  resizeWidget: (width, height) => ipcRenderer.send('widget:resize', { width, height }),
  widgetMenu: () => ipcRenderer.send('widget:menu'),
  openSettings: () => ipcRenderer.send('settings:open'),
  close: () => ipcRenderer.send('win:close'),
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  quit: () => ipcRenderer.send('app:quit'),
  openExternal: (url) => ipcRenderer.send('open:external', url),
});
