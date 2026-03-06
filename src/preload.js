const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ckh', {
  getConfig:           ()          => ipcRenderer.invoke('get-config'),
  saveConfig:          (cfg)       => ipcRenderer.invoke('save-config', cfg),
  getPlatform:         ()          => ipcRenderer.invoke('get-platform'),
  getRegistry:         ()          => ipcRenderer.invoke('get-registry'),
  getDiskFree:         ()          => ipcRenderer.invoke('get-disk-free'),
  installComponent:    (id)        => ipcRenderer.invoke('install-component', id),
  uninstallComponent:  (id)        => ipcRenderer.invoke('uninstall-component', id),
  startService:        (id)        => ipcRenderer.invoke('start-service', id),
  stopService:         (id)        => ipcRenderer.invoke('stop-service', id),
  openExternal:        (url)       => ipcRenderer.invoke('open-external', url),
  getMonitorStatus:    ()          => ipcRenderer.invoke('get-monitor-status'),

  onInstallProgress:   (cb) => ipcRenderer.on('install-progress', (_, d) => cb(d)),
  onServiceLog:        (cb) => ipcRenderer.on('service-log',      (_, d) => cb(d)),
  onServiceStatus:     (cb) => ipcRenderer.on('service-status',   (_, d) => cb(d)),
  onMonitorStatus:     (cb) => ipcRenderer.on('monitor-status',   (_, d) => cb(d)),
});
