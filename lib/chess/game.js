/**
 * CKB Chess — Fiber Payment Engine
 *
 * Manages a Fiber channel for one chess game.
 * - One channel opened per game (peer must be connected)
 * - Each move: loser pays 1 CKB (or agreed stake) via invoice/payment
 * - Game end: channel settled and closed
 * - Win recorded as DOB (optional, minted post-game)
 *
 * Usage:
 *   const game = new ChessGame({ fiber, peerId, stakePerMove: 100000000n });
 *   await game.open();
 *   await game.move('e2e4');         // sends payment if it's a capture/check
 *   await game.settle('white');      // close channel, declare winner
 */

const FiberClient = require('../fiber/client');
const { Chess } = require('chess.js');  // npm install chess.js

const SHANNON_PER_CKB = 100_000_000n;

class ChessGame {
  constructor({ fiber, peerId, stakePerMove = SHANNON_PER_CKB, channelCapacity }) {
    this.fiber = fiber instanceof FiberClient ? fiber : new FiberClient(fiber);
    this.peerId = peerId;
    this.stakePerMove = BigInt(stakePerMove);
    this.channelCapacity = channelCapacity || this.stakePerMove * 200n; // 200 move buffer
    this.channelId = null;
    this.chess = new Chess();
    this.moveHistory = [];
    this.payments = [];
    this.status = 'idle'; // idle | open | playing | settled
  }

  // Open a Fiber channel for this game
  async open() {
    const result = await this.fiber.openChannel({
      peerId: this.peerId,
      fundingAmount: this.channelCapacity,
      isPublic: false  // private game channel
    });
    this.channelId = result.channel_id;
    this.status = 'open';
    console.log(`[Chess] Channel opened: ${this.channelId}`);
    return this.channelId;
  }

  // Make a move — returns { move, fen, payment? }
  async move(uci, sendPayment = false) {
    const move = this.chess.move(uci);
    if (!move) throw new Error(`Illegal move: ${uci}`);

    this.moveHistory.push({ move, fen: this.chess.fen(), timestamp: Date.now() });
    this.status = 'playing';

    let payment = null;
    if (sendPayment) {
      // Request invoice from opponent, pay it
      payment = await this._payOpponent();
    }

    return { move, fen: this.chess.fen(), payment, gameOver: this.chess.isGameOver() };
  }

  async _payOpponent() {
    const invoice = await this.fiber.newInvoice({
      amount: this.stakePerMove,
      description: `CKB Chess move ${this.moveHistory.length}`,
      expiry: 300
    });
    const payment = await this.fiber.sendPayment({ invoice: invoice.invoice_address });
    this.payments.push(payment);
    return payment;
  }

  // Settle game — close channel, return result
  async settle(winner) {
    if (!this.channelId) throw new Error('No channel open');
    await this.fiber.shutdownChannel({ channelId: this.channelId });
    this.status = 'settled';

    const record = {
      winner,
      moves: this.moveHistory.length,
      pgn: this.chess.pgn(),
      payments: this.payments.length,
      totalPaid: this.payments.length * Number(this.stakePerMove / SHANNON_PER_CKB),
      timestamp: Date.now()
    };

    console.log(`[Chess] Game settled. Winner: ${winner}, Moves: ${record.moves}`);
    return record;
  }

  // Abandon game without settling (e.g. disconnect)
  async abandon() {
    if (this.channelId) {
      await this.fiber.shutdownChannel({ channelId: this.channelId }).catch(() => {});
    }
    this.status = 'idle';
  }

  get fen() { return this.chess.fen(); }
  get pgn() { return this.chess.pgn(); }
  get isGameOver() { return this.chess.isGameOver(); }
  get turn() { return this.chess.turn(); }
  get moves() { return this.chess.moves(); }
}

module.exports = ChessGame;
