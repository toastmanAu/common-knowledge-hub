const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ckh', {
  getConfig:      ()        => ipcRenderer.invoke('get-config'),
  saveConfig:     (cfg)     => ipcRenderer.invoke('save-config', cfg),
  getPlatform:    ()        => ipcRenderer.invoke('get-platform'),
  getServices:    ()        => ipcRenderer.invoke('get-services'),
  startService:   (id)      => ipcRenderer.invoke('start-service', id),
  stopService:    (id)      => ipcRenderer.invoke('stop-service', id),
  openExternal:   (url)     => ipcRenderer.invoke('open-external', url),

  onServiceLog:    (cb) => ipcRenderer.on('service-log',    (_, d) => cb(d)),
  onServiceStatus: (cb) => ipcRenderer.on('service-status', (_, d) => cb(d)),
});
