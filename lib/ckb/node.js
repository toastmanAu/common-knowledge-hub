/**
 * CKB Node Manager
 * Starts, stops, monitors the CKB full node or light client.
 * Works identically on desktop (Electron) and SBC (systemd).
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class CkbNode extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      mode: config.mode || 'full',        // 'full' | 'light'
      rpcUrl: config.rpcUrl || 'http://127.0.0.1:8114',
      dataDir: config.dataDir || path.join(process.env.HOME, '.ckh', 'ckb-data'),
      binPath: config.binPath || this._findBin('ckb'),
      ...config
    };
    this.process = null;
    this.status = 'stopped';  // stopped | starting | running | error
    this._pollTimer = null;
  }

  _findBin(name) {
    const arch = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    const local = path.join(__dirname, '../../bin', arch, name);
    if (fs.existsSync(local)) return local;
    try { return execSync(`which ${name}`).toString().trim(); } catch { return name; }
  }

  async start() {
    if (this.status === 'running') return;
    this.status = 'starting';
    this.emit('status', this.status);

    fs.mkdirSync(this.config.dataDir, { recursive: true });

    const args = ['run', '--config-file', path.join(this.config.dataDir, 'ckb.toml')];
    if (this.config.mode === 'light') args.push('--indexer');

    this.process = spawn(this.config.binPath, args, {
      cwd: this.config.dataDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', d => this.emit('log', d.toString()));
    this.process.stderr.on('data', d => this.emit('log', d.toString()));
    this.process.on('exit', code => {
      this.status = code === 0 ? 'stopped' : 'error';
      this.emit('status', this.status);
      this._stopPoll();
    });

    this._startPoll();
  }

  async stop() {
    if (this.process) this.process.kill('SIGTERM');
    this._stopPoll();
  }

  async getStats() {
    try {
      const res = await fetch(this.config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'get_tip_header', params: [], id: 1 })
      });
      const data = await res.json();
      const peers = await this._getPeers();
      return {
        blockHeight: parseInt(data.result?.number, 16) || 0,
        blockHash: data.result?.hash || '',
        timestamp: parseInt(data.result?.timestamp, 16) || 0,
        peers,
        status: this.status
      };
    } catch {
      return { blockHeight: 0, peers: 0, status: this.status };
    }
  }

  async _getPeers() {
    try {
      const res = await fetch(this.config.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'get_peers', params: [], id: 2 })
      });
      const data = await res.json();
      return Array.isArray(data.result) ? data.result.length : 0;
    } catch { return 0; }
  }

  _startPoll() {
    this._pollTimer = setInterval(async () => {
      const stats = await this.getStats();
      if (stats.blockHeight > 0 && this.status === 'starting') {
        this.status = 'running';
        this.emit('status', this.status);
      }
      this.emit('stats', stats);
    }, 6000);
  }

  _stopPoll() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }
}

module.exports = CkbNode;
