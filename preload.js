const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  searchGames: (query) => ipcRenderer.invoke('search-games', query),
  fetchPlayerData: (appid) => ipcRenderer.invoke('fetch-player-data', appid),
  writeFrame: (index, buffer) => ipcRenderer.invoke('write-frame', index, buffer),
  encodeVideo: (outPath, opts) => ipcRenderer.invoke('encode-video', outPath, opts),
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project'),
});
