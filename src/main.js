const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { getRegistry } = require('../services/registry');
const installer = require('../services/installer');

const IS_DEV = process.argv.includes('--dev');
const CKH_DIR = path.join(os.homedir(), '.ckh');
const CONFIG_FILE = path.join(CKH_DIR, 'config.json');

if (!fs.existsSync(CKH_DIR)) fs.mkdirSync(CKH_DIR, { recursive: true });

const DEFAULT_CONFIG = {
  version: 1,
  network: 'mainnet',
  services: {
    ckbNode:     { rpcHost: '127.0.0.1', rpcPort: 8114 },
    fiberNode:   { rpcHost: '127.0.0.1', rpcPort: 8227, p2pPort: 8228 },
    lightClient: { rpcHost: '127.0.0.1', rpcPort: 9000 },
    stratum:     { upstreamPool: 'ckb.viabtc.com', upstreamPort: 3333, listenPort: 3333 },
  },
};

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; }
  catch { return DEFAULT_CONFIG; }
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }

// Process registry
const procs = {};

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 750, minWidth: 800, minHeight: 580,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  if (IS_DEV) win.webContents.openDevTools();
  return win;
}

// ── IPC ──────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, cfg) => { saveConfig(cfg); return true; });
ipcMain.handle('get-platform', () => `${process.platform}-${process.arch}`);

ipcMain.handle('get-registry', () => {
  const cfg = loadConfig();
  return getRegistry().map(c => ({
    ...c,
    installed: installer.isInstalled(c),
    running: procs[c.id]?.status === 'running',
    status: procs[c.id]?.status || 'stopped',
  }));
});

ipcMain.handle('install-component', async (event, componentId) => {
  const reg = getRegistry();
  const component = reg.find(c => c.id === componentId);
  if (!component) return { ok: false, error: 'unknown component' };
  if (!component.available) return { ok: false, error: `not available on ${process.platform}-${process.arch}` };

  installer.on('progress', (data) => {
    if (data.id === componentId) event.sender.send('install-progress', data);
  });

  try {
    await installer.install(component);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('uninstall-component', async (_, componentId) => {
  const reg = getRegistry();
  const component = reg.find(c => c.id === componentId);
  if (!component) return { ok: false, error: 'unknown component' };
  if (procs[componentId]?.status === 'running') return { ok: false, error: 'stop the service first' };
  await installer.uninstall(component);
  return { ok: true };
});

ipcMain.handle('start-service', (event, componentId) => {
  if (procs[componentId]?.status === 'running') return { ok: false, error: 'already running' };
  const reg = getRegistry();
  const component = reg.find(c => c.id === componentId);
  if (!component) return { ok: false, error: 'unknown' };
  if (!installer.isInstalled(component)) return { ok: false, error: 'not installed' };
  return startService(component, loadConfig(), event.sender);
});

ipcMain.handle('stop-service', (_, componentId) => {
  const p = procs[componentId];
  if (!p || p.status !== 'running') return { ok: false, error: 'not running' };
  p.process.kill('SIGTERM');
  return { ok: true };
});

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
ipcMain.handle('get-disk-free', () => {
  // Return free space on home partition (bytes)
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      const out = execSync(`wmic logicaldisk where "DeviceID='C:'" get FreeSpace`).toString();
      return parseInt(out.split('\n')[1]);
    }
    const out = execSync(`df -k "${os.homedir()}" | tail -1 | awk '{print $4}'`).toString();
    return parseInt(out.trim()) * 1024;
  } catch { return null; }
});

// ── Service launcher ──────────────────────────────────────────────

function startService(component, cfg, sender) {
  const binPath = installer.getBinPath(component);
  const serviceDir = path.join(CKH_DIR, component.id + '-data');
  if (!fs.existsSync(serviceDir)) fs.mkdirSync(serviceDir, { recursive: true });

  const args = {
    ckbNode:     [binPath, ['run', '--config-file', path.join(serviceDir, 'ckb.toml')]],
    fiberNode:   [binPath, ['--config-file', path.join(serviceDir, 'config.yml')]],
    lightClient: [binPath, ['run', '--config-file', path.join(serviceDir, 'config.toml')]],
    stratum:     [process.execPath, [path.join(__dirname, '..', 'services', 'stratum.js')]],
  }[component.id];

  if (!args) return { ok: false, error: 'no launcher defined' };

  let proc;
  try { proc = spawn(args[0], args[1], { cwd: serviceDir }); }
  catch (e) { return { ok: false, error: e.message }; }

  const entry = { process: proc, logs: [], status: 'running' };
  procs[component.id] = entry;

  const onLog = (data) => {
    const line = data.toString();
    entry.logs.push(line);
    if (entry.logs.length > 300) entry.logs.shift();
    sender?.send('service-log', { id: component.id, line });
  };
  proc.stdout?.on('data', onLog);
  proc.stderr?.on('data', onLog);
  proc.on('exit', (code) => {
    entry.status = code === 0 ? 'stopped' : 'crashed';
    entry.process = null;
    sender?.send('service-status', { id: component.id, status: entry.status, code });
  });

  return { ok: true, pid: proc.pid };
}

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  for (const [, p] of Object.entries(procs)) {
    if (p.status === 'running') p.process?.kill('SIGTERM');
  }
  if (process.platform !== 'darwin') app.quit();
});
