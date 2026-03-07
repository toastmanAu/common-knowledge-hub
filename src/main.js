/**
 * CKH Electron Main Process
 * Starts the CKH backend server, then opens a BrowserWindow pointing at it.
 * On SBC, this file is NOT used — use `npm run sbc` (src/server.js directly).
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { start: startServer } = require('./server');

let mainWindow;

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../assets/icons/icon.png'),
  });

  // In dev, Vite serves the UI on 3000 with HMR; in prod, server serves built UI
  const isDev = process.argv.includes('--dev');
  const url = isDev ? 'http://localhost:3000' : `http://localhost:${port}`;

  mainWindow.loadURL(url);

  if (isDev) mainWindow.webContents.openDevTools();

  // Open external links in system browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  const port = await startServer();
  await createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
