import { h } from 'preact';
import { useState } from 'preact/hooks';

export default function Chess() {
  const [gameState, setGameState] = useState('idle');
  return (
    <div class="page chess">
      <h1>CKB Chess</h1>
      <p class="subtitle">Play chess with Fiber micropayments per move</p>
      {gameState === 'idle' && (
        <div class="game-setup">
          <button class="btn-primary" onClick={() => setGameState('connecting')}>
            New Game
          </button>
        </div>
      )}
      {gameState !== 'idle' && (
        <div class="board-placeholder">
          Chess board coming soon — chess.js + chessboard integration
        </div>
      )}
    </div>
  );
}
