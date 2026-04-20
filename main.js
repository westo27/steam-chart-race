const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const steamcharts = require('./main/steamcharts');
const steamApps = require('./main/steam-apps');
const ffmpegExport = require('./main/ffmpeg-export');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('renderer/index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Refresh Steam app list in background — never blocks the UI
  steamApps.refreshIfNeeded().catch(e => {
    console.error('[main] steam app list refresh failed:', e.message);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC handlers ---

ipcMain.handle('search-games', async (_event, query) => {
  return steamApps.search(query);
});

ipcMain.handle('fetch-player-data', async (_event, appid) => {
  return steamcharts.fetchPlayerData(appid);
});

ipcMain.handle('write-frame', async (_event, index, buffer) => {
  return ffmpegExport.writeFrame(index, buffer);
});

ipcMain.handle('encode-video', async (_event, outPath, opts) => {
  return ffmpegExport.encodeVideo(outPath, opts);
});

ipcMain.handle('pick-audio-dialog', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Choose Background Music',
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { canceled: true };
  return { filePath: filePaths[0] };
});

ipcMain.handle('fetch-image', async (_event, url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[fetch-image] HTTP ${res.status} for ${url}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    const mime = res.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${b64}`;
    console.log(`[fetch-image] OK ${url} (${buffer.byteLength} bytes, ${mime})`);
    return dataUrl;
  } catch (e) {
    console.error('[fetch-image] failed:', url, e.message);
    return null;
  }
});

ipcMain.handle('save-video-dialog', async () => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Export Video',
    defaultPath: 'steam-chart-race.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  return { filePath };
});

ipcMain.handle('save-project', async (_event, data) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: 'Save Project',
    defaultPath: 'project.steamrace',
    filters: [{ name: 'Steam Chart Race', extensions: ['steamrace'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const fs = require('fs');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return { filePath };
});

ipcMain.handle('reveal-file', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('load-project', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'Open Project',
    filters: [{ name: 'Steam Chart Race', extensions: ['steamrace'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { canceled: true };

  const fs = require('fs');
  const raw = fs.readFileSync(filePaths[0], 'utf8');
  return { data: JSON.parse(raw), filePath: filePaths[0] };
});
