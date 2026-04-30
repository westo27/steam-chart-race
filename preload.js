// Steam Chart Race — animated player count videos
// Copyright (C) 2026 Tom Weston
// Licensed under GPL v3. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  searchGames: (query) => ipcRenderer.invoke('search-games', query),
  fetchPlayerData: (appid) => ipcRenderer.invoke('fetch-player-data', appid),
  writeFrame: (index, buffer) => ipcRenderer.invoke('write-frame', index, buffer),
  encodeVideo: (outPath, opts) => ipcRenderer.invoke('encode-video', outPath, opts),
  fetchImage: (url) => ipcRenderer.invoke('fetch-image', url),
  saveVideoDialog: () => ipcRenderer.invoke('save-video-dialog'),
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project'),
  revealFile: (filePath) => ipcRenderer.invoke('reveal-file', filePath),
  pickAudioDialog: () => ipcRenderer.invoke('pick-audio-dialog'),
});
