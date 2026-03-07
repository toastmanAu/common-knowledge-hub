/**
 * Fiber RPC Client
 * Thin Node.js wrapper around the Fiber Network Node JSON-RPC interface.
 * Used by Chess, dashboard, and any other CKH module that needs Fiber.
 */

const DEFAULT_RPC = 'http://127.0.0.1:8227';

class FiberClient {
  constructor(rpcUrl = DEFAULT_RPC) {
    this.rpcUrl = rpcUrl;
    this._id = 0;
  }

  async _call(method, params = []) {
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++this._id })
    });
    const data = await res.json();
    if (data.error) throw new Error(`Fiber RPC ${method}: ${data.error.message}`);
    return data.result;
  }

  // ── Node info ──────────────────────────────────────────────────
  async getNodeInfo()       { return this._call('get_node_info'); }
  async listPeers()         { return this._call('list_peers'); }

  // ── Channels ───────────────────────────────────────────────────
  async listChannels(peerId) {
    return this._call('list_channels', [{ peer_id: peerId }]);
  }

  async openChannel({ peerId, fundingAmount, isPublic = true }) {
    return this._call('open_channel', [{
      peer_id: peerId,
      funding_amount: `0x${BigInt(fundingAmount).toString(16)}`,
      public: isPublic
    }]);
  }

  async shutdownChannel({ channelId, closeScript, feeRate = '0x3FC' }) {
    return this._call('shutdown_channel', [{
      channel_id: channelId,
      close_script: closeScript,
      fee_rate: feeRate
    }]);
  }

  // ── Payments ───────────────────────────────────────────────────
  async sendPayment({ invoice, amount }) {
    return this._call('send_payment', [{ invoice, amount: `0x${BigInt(amount).toString(16)}` }]);
  }

  async getPayment(paymentHash) {
    return this._call('get_payment', [{ payment_hash: paymentHash }]);
  }

  // ── Invoices ───────────────────────────────────────────────────
  async newInvoice({ amount, description, expiry = 3600 }) {
    return this._call('new_invoice', [{
      amount: `0x${BigInt(amount).toString(16)}`,
      description,
      expiry: `0x${expiry.toString(16)}`
    }]);
  }

  async parseInvoice(invoice) {
    return this._call('parse_invoice', [{ invoice }]);
  }

  // ── Graph ──────────────────────────────────────────────────────
  async graphNodes()  { return this._call('graph_nodes', [{}]); }
  async graphEdges()  { return this._call('graph_edges', [{}]); }

  // ── Health ─────────────────────────────────────────────────────
  async isReachable() {
    try { await this.getNodeInfo(); return true; } catch { return false; }
  }
}

module.exports = FiberClient;
