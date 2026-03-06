const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const IS_DEV = process.argv.includes('--dev');
const CKH_DIR = path.join(os.homedir(), '.ckh');
const CONFIG_FILE = path.join(CKH_DIR, 'config.json');
const PLATFORM = `${process.platform}-${process.arch}`;

// Ensure ~/.ckh exists
if (!fs.existsSync(CKH_DIR)) fs.mkdirSync(CKH_DIR, { recursive: true });

// Default config
const DEFAULT_CONFIG = {
  version: 1,
  services: {
    ckbNode:     { enabled: false, dataDir: path.join(CKH_DIR, 'ckb-data'),     port: 8114 },
    fiberNode:   { enabled: false, dataDir: path.join(CKH_DIR, 'fiber-data'),   rpcPort: 8227, p2pPort: 8228 },
    lightClient: { enabled: false, dataDir: path.join(CKH_DIR, 'light-data'),   port: 9000 },
    stratum:     { enabled: false, upstreamPool: '', upstreamPort: 3333,         listenPort: 3333 },
  },
  network: 'mainnet',
  autoStart: [],
  theme: 'dark',
};

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Process registry: { id: { process, logs: [], status } }
const procs = {};

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  if (IS_DEV) win.webContents.openDevTools();

  return win;
}

// ── IPC handlers ───────────────────────────────────────────────────

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_, cfg) => { saveConfig(cfg); return true; });
ipcMain.handle('get-platform', () => PLATFORM);
ipcMain.handle('get-services', () => {
  const result = {};
  for (const [id, p] of Object.entries(procs)) {
    result[id] = { status: p.status, pid: p.process?.pid, logTail: p.logs.slice(-50) };
  }
  return result;
});

ipcMain.handle('start-service', async (event, serviceId) => {
  if (procs[serviceId]?.status === 'running') return { ok: false, error: 'already running' };
  const cfg = loadConfig();
  return startService(serviceId, cfg, event.sender);
});

ipcMain.handle('stop-service', async (_, serviceId) => {
  const p = procs[serviceId];
  if (!p || p.status !== 'running') return { ok: false, error: 'not running' };
  p.process.kill('SIGTERM');
  return { ok: true };
});

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

// ── Service launcher ───────────────────────────────────────────────

function startService(id, cfg, sender) {
  const binDir = path.join(__dirname, '..', 'bin', PLATFORM);

  const launchers = {
    ckbNode: () => {
      const bin = path.join(binDir, 'ckb');
      const dataDir = cfg.services.ckbNode.dataDir;
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      return spawn(bin, ['run', '--config-file', path.join(dataDir, 'ckb.toml')], { cwd: dataDir });
    },
    fiberNode: () => {
      const bin = path.join(binDir, 'fnn');
      const dataDir = cfg.services.fiberNode.dataDir;
      return spawn(bin, ['--config-file', path.join(dataDir, 'config.yml')], { cwd: dataDir });
    },
    lightClient: () => {
      const bin = path.join(binDir, 'ckb-light-client');
      const dataDir = cfg.services.lightClient.dataDir;
      return spawn(bin, ['run', '--config-file', path.join(dataDir, 'config.toml')], { cwd: dataDir });
    },
    stratum: () => {
      const script = path.join(__dirname, '..', 'services', 'stratum', 'proxy.js');
      return spawn(process.execPath, [script], {
        env: {
          ...process.env,
          UPSTREAM_POOL: cfg.services.stratum.upstreamPool,
          UPSTREAM_PORT: String(cfg.services.stratum.upstreamPort),
          LISTEN_PORT: String(cfg.services.stratum.listenPort),
        }
      });
    },
  };

  const launcher = launchers[id];
  if (!launcher) return { ok: false, error: `unknown service: ${id}` };

  let proc;
  try {
    proc = launcher();
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const entry = { process: proc, logs: [], status: 'running' };
  procs[id] = entry;

  const onLog = (data) => {
    const line = data.toString();
    entry.logs.push(line);
    if (entry.logs.length > 500) entry.logs.shift();
    sender?.send('service-log', { id, line });
  };

  proc.stdout?.on('data', onLog);
  proc.stderr?.on('data', onLog);

  proc.on('exit', (code) => {
    entry.status = code === 0 ? 'stopped' : 'crashed';
    entry.process = null;
    sender?.send('service-status', { id, status: entry.status, code });
  });

  return { ok: true, pid: proc.pid };
}

// ── App lifecycle ──────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Stop all running services on quit
  for (const [, p] of Object.entries(procs)) {
    if (p.status === 'running') p.process?.kill('SIGTERM');
  }
  if (process.platform !== 'darwin') app.quit();
});
