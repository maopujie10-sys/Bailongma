const { contextBridge, ipcRenderer, webFrame, clipboard } = require('electron')

contextBridge.exposeInMainWorld('bailongma', {
  platform: process.platform,
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
  startDownload: () => ipcRenderer.invoke('updater:start-download'),
  quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install'),
  getZoomFactor: () => webFrame.getZoomFactor(),
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  onUpdaterStatus: (handler) => {
    if (typeof handler !== 'function') return () => {}
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },
  // Clipboard support for mouse selection copy
  copyText: (text) => clipboard.writeText(String(text || '')),
  readText: () => clipboard.readText(),
})