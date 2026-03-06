// services/config-writer.js
// Writes CKB/Fiber/LightClient config files from CKH options
// CKH owns all config — writes directly on install and on settings save

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── CKB Full Node — ckb.toml ──────────────────────────────────────
function writeCkbConfig(dataDir, opts = {}) {
  const {
    network      = 'mainnet',
    rpcPort      = 8114,
    p2pPort      = 8115,
    indexer      = true,
    richIndexer  = true,
    subscription = false,
    syncMode     = 'snapshot',
  } = opts;

  const chainSpec = network === 'mainnet'
    ? 'resource://specs/mainnet.toml'
    : 'resource://specs/testnet.toml';

  // Build modules list
  const modules = ['Net', 'Pool', 'Miner', 'Chain', 'Stats', 'Experiment', 'Debug', 'Indexer'];
  if (richIndexer)  modules.push('RichIndexer');
  if (subscription) modules.push('Subscription');

  const toml = `# CKB Full Node config — managed by Common Knowledge Hub
# Edit here or use CKH settings panel

[chain]
spec = { bundled = "${chainSpec}" }

[logger]
filter = "info,ckb-network=info"
color = false
log_to_file = true
log_to_stdout = false
log_dir = "${escape(path.join(dataDir, 'logs'))}"

[sentry]
dsn = ""

[metrics]
exporter = "prometheus"
listen_address = "127.0.0.1:8100"

[memory_tracker]
interval = "0"

[rpc]
listen_address = "127.0.0.1:${rpcPort}"
modules = [${modules.map(m => `"${m}"`).join(', ')}]
reject_ill_transactions = true
enable_deprecated_rpc = false

[network]
listen_addresses = ["/ip4/0.0.0.0/tcp/${p2pPort}"]
max_peers = 125
max_outbound_peers = 8
path = "${escape(path.join(dataDir, 'network'))}"

[sync]
${syncMode === 'trusted' ? 'assume_valid_target = "0x0000000000000000000000000000000000000000000000000000000000000000"' : '# Full verification (no assume-valid)'}

[store]
path = "${escape(path.join(dataDir, 'db'))}"
indexer_db = "${escape(path.join(dataDir, 'indexer'))}"

[tx_pool]
max_tx_pool_size = 180000000
max_verify_cache_size = 100000

[block_assembler]
code_hash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
args = "0x0000000000000000000000000000000000000000"
hash_type = "type"
message = "0x"

${indexer ? `[indexer]
index_tx_pool = true
` : '# Indexer disabled'}

${richIndexer ? `[rich_indexer]
indexer_db = "${escape(path.join(dataDir, 'rich-indexer'))}"
` : '# Rich indexer disabled'}
`;

  const confPath = path.join(dataDir, 'ckb.toml');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(confPath, toml);
  return confPath;
}

// ── Fiber Node — config.yml ───────────────────────────────────────
function writeFiberConfig(dataDir, opts = {}) {
  const {
    network    = 'mainnet',
    rpcPort    = 8227,
    p2pPort    = 8228,
    ckbRpcUrl  = 'http://127.0.0.1:8114/',
    walletKey  = path.join(dataDir, 'fiber.key'),
    autoAccept = true,
    minCkb     = 100,
  } = opts;

  const yml = `# Fiber Node config — managed by Common Knowledge Hub

fiber:
  listening_addr: "/ip4/0.0.0.0/tcp/${p2pPort}"
  announced_addrs: []
  network: ${network}
  
  rpc_listening_addr: "127.0.0.1:${rpcPort}"
  
  ckb_rpc_url: "${ckbRpcUrl}"
  
  # Wallet
  fiber_key: "${escape(walletKey)}"
  
  # Channel auto-accept
  auto_accept_channel_ckb_funding_amount: "${autoAccept ? minCkb * 100000000 : 0}"
  
  # Store
  store_path: "${escape(path.join(dataDir, 'store'))}"

services:
  - Rpc
  - Fiber
`;

  const confPath = path.join(dataDir, 'config.yml');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(confPath, yml);
  return confPath;
}

// ── Light Client — config.toml ────────────────────────────────────
function writeLightConfig(dataDir, opts = {}) {
  const {
    network = 'mainnet',
    rpcPort = 9000,
    p2pPort = 9001,
  } = opts;

  const chainSpec = network === 'mainnet'
    ? 'resource://specs/mainnet.toml'
    : 'resource://specs/testnet.toml';

  const toml = `# CKB Light Client config — managed by Common Knowledge Hub

[chain]
spec = { bundled = "${chainSpec}" }

[rpc]
listen_address = "127.0.0.1:${rpcPort}"

[network]
listen_addresses = ["/ip4/0.0.0.0/tcp/${p2pPort}"]
store = "${escape(path.join(dataDir, 'network'))}"

[store]
path = "${escape(path.join(dataDir, 'db'))}"
`;

  const confPath = path.join(dataDir, 'config.toml');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(confPath, toml);
  return confPath;
}

// ── systemd unit file ─────────────────────────────────────────────
function writeSystemdUnit(serviceId, binPath, dataDir, confFile, opts = {}) {
  const { user = os.userInfo().username } = opts;

  const labels = {
    ckbNode:     { name: 'CKB Node',         desc: 'Nervos CKB Layer 1 full node' },
    fiberNode:   { name: 'Fiber Node',        desc: 'CKB Fiber payment channel node' },
    lightClient: { name: 'CKB Light Client',  desc: 'CKB light client (header sync)' },
    stratum:     { name: 'CKB Stratum Proxy', desc: 'CKB Stratum mining proxy' },
  };

  const args = {
    ckbNode:     `${binPath} run --config-file ${confFile}`,
    fiberNode:   `${binPath} --config-file ${confFile}`,
    lightClient: `${binPath} run --config-file ${confFile}`,
    stratum:     `node ${binPath}`,
  };

  const l = labels[serviceId] || { name: serviceId, desc: serviceId };
  const unit = `[Unit]
Description=${l.desc}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${dataDir}
ExecStart=${args[serviceId] || binPath}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ckh-${serviceId}

[Install]
WantedBy=multi-user.target
`;

  const unitPath = `/etc/systemd/system/ckh-${serviceId}.service`;
  return { unit, unitPath, installCmd: `sudo systemctl daemon-reload && sudo systemctl enable ckh-${serviceId} && sudo systemctl start ckh-${serviceId}` };
}

// ── launchd plist (macOS) ─────────────────────────────────────────
function writeLaunchdPlist(serviceId, binPath, dataDir, confFile) {
  const label = `com.wyltek.ckh.${serviceId}`;
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'CKH');
  fs.mkdirSync(logDir, { recursive: true });

  const args = {
    ckbNode:     [binPath, 'run', '--config-file', confFile],
    fiberNode:   [binPath, '--config-file', confFile],
    lightClient: [binPath, 'run', '--config-file', confFile],
  };

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    ${(args[serviceId] || [binPath]).map(a => `<string>${a}</string>`).join('\n    ')}
  </array>
  <key>WorkingDirectory</key><string>${dataDir}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(logDir, serviceId + '.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, serviceId + '.err')}</string>
</dict>
</plist>`;

  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  return { plist, plistPath, installCmd: `launchctl load -w ${plistPath}` };
}

function escape(p) { return p.replace(/\\/g, '\\\\'); }

module.exports = { writeCkbConfig, writeFiberConfig, writeLightConfig, writeSystemdUnit, writeLaunchdPlist };
