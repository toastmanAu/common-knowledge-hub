// services/monitor.js — Runtime status monitor
// Polls RPC endpoints for each running service and emits structured status events

const { EventEmitter } = require('events');
const http = require('http');
const os = require('os');
const path = require('path');

class Monitor extends EventEmitter {
  constructor() {
    super();
    this._timers = {};
    this._status = {};
  }

  start(serviceId, opts = {}) {
    if (this._timers[serviceId]) return;
    const interval = opts.interval || 5000;
    this._timers[serviceId] = setInterval(() => this._poll(serviceId, opts), interval);
    this._poll(serviceId, opts); // immediate first poll
  }

  stop(serviceId) {
    if (this._timers[serviceId]) {
      clearInterval(this._timers[serviceId]);
      delete this._timers[serviceId];
    }
    delete this._status[serviceId];
  }

  stopAll() {
    for (const id of Object.keys(this._timers)) this.stop(id);
  }

  getStatus(serviceId) {
    return this._status[serviceId] || null;
  }

  getAllStatus() {
    return { ...this._status };
  }

  async _poll(serviceId, opts) {
    try {
      let status;
      switch (serviceId) {
        case 'ckbNode':     status = await this._pollCkbNode(opts);     break;
        case 'fiberNode':   status = await this._pollFiberNode(opts);   break;
        case 'lightClient': status = await this._pollLightClient(opts); break;
        case 'stratum':     status = await this._pollStratum(opts);     break;
        default:            status = { id: serviceId, ok: true };
      }
      status.id = serviceId;
      status.ts = Date.now();
      this._status[serviceId] = status;
      this.emit('status', status);
    } catch (e) {
      const status = { id: serviceId, ok: false, error: e.message, ts: Date.now() };
      this._status[serviceId] = status;
      this.emit('status', status);
    }
  }

  async _pollCkbNode(opts) {
    const port = opts.rpcPort || 8114;
    const [localNode, syncState, txPool] = await Promise.all([
      this._rpc(port, 'local_node_info'),
      this._rpc(port, 'sync_state'),
      this._rpc(port, 'tx_pool_info'),
    ]);

    const tip = parseInt(syncState.best_known_block_number || 0);
    const local = parseInt(syncState.local_best_known_block?.number || 0);
    const ibd = syncState.ibd;
    const pct = tip > 0 ? Math.min(100, (local / tip * 100)) : 0;

    return {
      ok: true,
      service: 'ckbNode',
      nodeId: localNode.node_id?.slice(0, 16) + '…',
      version: localNode.version,
      peers: (localNode.connections || []).length,
      localBlock: local,
      tipBlock: tip,
      syncPct: pct.toFixed(1),
      ibd,
      pendingTx: parseInt(txPool.pending_size || 0),
      proposedTx: parseInt(txPool.proposed_size || 0),
    };
  }

  async _pollFiberNode(opts) {
    const port = opts.rpcPort || 8227;
    const [info, channels] = await Promise.all([
      this._rpc(port, 'node_info', [], '/'),
      this._rpc(port, 'list_channels', [{ peer_id: null }], '/'),
    ]);
    return {
      ok: true,
      service: 'fiberNode',
      nodeId: info.node_id?.slice(0, 16) + '…',
      peers: (info.peers || []).length,
      channels: (channels.channels || []).length,
      totalCapacity: channels.channels?.reduce((s, c) => s + parseInt(c.local_balance || 0), 0),
    };
  }

  async _pollLightClient(opts) {
    const port = opts.rpcPort || 9000;
    const [localNode, syncState] = await Promise.all([
      this._rpc(port, 'local_node_info'),
      this._rpc(port, 'get_scripts'),
    ]);
    return {
      ok: true,
      service: 'lightClient',
      peers: (localNode.connections || []).length,
      scripts: (syncState || []).length,
    };
  }

  async _pollStratum(opts) {
    const port = opts.statsPort || 8081;
    const data = await this._httpGet(`http://127.0.0.1:${port}/`);
    const json = JSON.parse(data);
    return {
      ok: true,
      service: 'stratum',
      miners: json.miners || 0,
      hasTemplate: json.hasTemplate || false,
      uptime: json.uptime,
    };
  }

  _rpc(port, method, params = [], path = '/') {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ id: 1, jsonrpc: '2.0', method, params });
      const req = http.request(
        { hostname: '127.0.0.1', port, path, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        res => {
          let data = '';
          res.on('data', d => data += d);
          res.on('end', () => {
            try { resolve(JSON.parse(data).result || {}); }
            catch (e) { reject(e); }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body); req.end();
    });
  }

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      http.get(url, { timeout: 3000 }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve(data));
      }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
    });
  }
}

module.exports = new Monitor();
