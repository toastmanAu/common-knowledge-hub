import { h } from 'preact';

export default function Dashboard({ stats }) {
  if (!stats) return <div class="loading">Connecting to node...</div>;
  return (
    <div class="page dashboard">
      <h1>Node Dashboard</h1>
      <div class="stats-grid">
        <StatCard label="Block Height" value={stats.blockHeight?.toLocaleString()} />
        <StatCard label="Peers"        value={stats.peers} />
        <StatCard label="Status"       value={stats.status} />
        <StatCard label="Network"      value="Mainnet" />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      <div class="stat-value">{value ?? '—'}</div>
    </div>
  );
}
