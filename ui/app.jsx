import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import Dashboard from './pages/Dashboard.jsx';
import Chess from './pages/Chess.jsx';
import Fiber from './pages/Fiber.jsx';
import Settings from './pages/Settings.jsx';
import './styles/app.css';

const PAGES = ['dashboard', 'chess', 'fiber', 'settings'];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [nodeStats, setNodeStats] = useState(null);

  useEffect(() => {
    // Poll CKH backend for node stats every 6s
    const poll = () => fetch('/api/stats').then(r => r.json()).then(setNodeStats).catch(() => {});
    poll();
    const t = setInterval(poll, 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <div class="ckh-app">
      <nav class="sidebar">
        <div class="logo">
          <img src="/ckb-logo.svg" alt="CKB" width="32" height="32" />
          <span>CKH</span>
        </div>
        {PAGES.map(p => (
          <button
            key={p}
            class={`nav-btn ${page === p ? 'active' : ''}`}
            onClick={() => setPage(p)}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        <div class="node-status">
          <span class={`dot ${nodeStats?.status === 'running' ? 'green' : 'red'}`} />
          <span>{nodeStats?.blockHeight?.toLocaleString() ?? '—'}</span>
        </div>
      </nav>
      <main class="content">
        {page === 'dashboard' && <Dashboard stats={nodeStats} />}
        {page === 'chess'     && <Chess />}
        {page === 'fiber'     && <Fiber />}
        {page === 'settings'  && <Settings />}
      </main>
    </div>
  );
}

render(<App />, document.getElementById('app'));
