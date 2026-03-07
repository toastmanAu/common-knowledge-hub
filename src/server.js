/**
 * CKH Backend Server
 * Express API + static file server.
 * Runs in both modes:
 *   - Desktop: loaded by Electron main process
 *   - SBC: standalone Node.js process (npm run sbc)
 */

const express = require('express');
const path = require('path');
const CkbNode = require('../lib/ckb/node');
const FiberClient = require('../lib/fiber/client');

const PORT = process.env.CKH_PORT || 3001;

// ── Singletons ────────────────────────────────────────────────────
const ckb = new CkbNode({
  rpcUrl: process.env.CKB_RPC || 'http://127.0.0.1:8114',
  dataDir: process.env.CKB_DATA || path.join(process.env.HOME, '.ckh', 'ckb-data'),
});

const fiber = new FiberClient(
  process.env.FIBER_RPC || 'http://127.0.0.1:8227'
);

// Cache last known stats (so UI doesn't stall if node is slow)
let _stats  = { blockHeight: 0, peers: 0, status: 'stopped', timestamp: 0 };
let _fiber  = { nodeId: null, channels: [], peers: 0 };

// Poll CKB node every 6s
setInterval(async () => {
  try { _stats = await ckb.getStats(); } catch {}
}, 6000);

// Poll Fiber every 15s
setInterval(async () => {
  try {
    const info = await fiber.getNodeInfo();
    const chans = await fiber.listChannels().catch(() => ({ channels: [] }));
    _fiber = {
      nodeId:   info?.node_id,
      alias:    info?.alias,
      peers:    info?.num_peers || 0,
      channels: chans?.channels || [],
    };
  } catch {}
}, 15000);

// ── Express app ───────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Serve built UI (production) or proxy to Vite (dev via vite.config proxy)
const uiDir = path.join(__dirname, '../dist/ui');
app.use(express.static(uiDir));
app.use('/ckb-logo.svg', express.static(path.join(__dirname, '../assets/ckb-logo.svg')));

// ── API: Node stats ───────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const live = await ckb.getStats();
    _stats = live;
    res.json(live);
  } catch {
    res.json(_stats);
  }
});

// ── API: Fiber ────────────────────────────────────────────────────
app.get('/api/fiber/info', async (req, res) => {
  try {
    const info = await fiber.getNodeInfo();
    res.json(info);
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.get('/api/fiber/channels', async (req, res) => {
  try {
    const result = await fiber.listChannels();
    res.json(result?.channels || []);
  } catch {
    res.json(_fiber.channels);
  }
});

app.post('/api/fiber/open-channel', async (req, res) => {
  const { peerId, fundingAmount, isPublic } = req.body;
  try {
    const result = await fiber.openChannel({ peerId, fundingAmount, isPublic });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/fiber/send-payment', async (req, res) => {
  const { invoice, amount } = req.body;
  try {
    const result = await fiber.sendPayment({ invoice, amount });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/fiber/invoice', async (req, res) => {
  const { amount, description } = req.body;
  try {
    const result = await fiber.newInvoice({ amount, description });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Chess ────────────────────────────────────────────────────
const games = new Map(); // gameId → ChessGame instance

app.post('/api/chess/new', async (req, res) => {
  const { peerId, stakePerMove } = req.body;
  try {
    const { ChessGame } = require('../lib/chess/game');
    const game = new ChessGame({ fiber, peerId, stakePerMove: stakePerMove || 100_000_000 });
    const channelId = await game.open();
    const gameId = channelId;
    games.set(gameId, game);
    res.json({ gameId, channelId, fen: game.fen });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chess/:gameId/move', async (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const { move, pay } = req.body;
  try {
    const result = await game.move(move, pay);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/chess/:gameId/settle', async (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  try {
    const record = await game.settle(req.body.winner);
    games.delete(req.params.gameId);
    res.json(record);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chess/:gameId', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json({ fen: game.fen, pgn: game.pgn, turn: game.turn, isGameOver: game.isGameOver, moves: game.moves });
});

// ── API: Health ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ckb: _stats.status,
    fiberNodeId: _fiber.nodeId,
    uptime: process.uptime()
  });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(uiDir, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────
function start() {
  return new Promise(resolve => {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`[CKH] Server running → http://localhost:${PORT}`);
      resolve(PORT);
    });
  });
}

module.exports = { app, start };

// Run standalone if called directly (SBC mode)
if (require.main === module) {
  start();
}
