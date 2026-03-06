// services/registry.js — Component download registry
// Each entry defines a downloadable component with metadata

const os = require('os');
const path = require('path');

const PLATFORM = `${process.platform}-${process.arch}`;

// Base URL for binary releases
const RELEASE_BASE = 'https://github.com/toastmanAu/common-knowledge-hub/releases/download';
const CKB_VERSION = '0.204.0';
const FIBER_VERSION = '0.7.1';
const LIGHT_VERSION = '0.4.1';

// Registry of installable components
const REGISTRY = [
  {
    id: 'ckbNode',
    label: 'CKB Full Node',
    icon: '⛓',
    desc: 'Full Nervos Layer 1 node — validates every block and transaction. Required for maximum trustlessness.',
    diskGB: 120,
    ramMB: 512,
    cpuNote: 'Any modern CPU. Syncs faster with better CPU/SSD.',
    network: 'Yes — 20+ peers, port 8115 outbound',
    binaries: {
      'linux-x64':   { url: `https://github.com/nervosnetwork/ckb/releases/download/v${CKB_VERSION}/ckb_v${CKB_VERSION}_x86_64-unknown-linux-gnu-portable.tar.gz`, bin: 'ckb' },
      'linux-arm64': { url: `https://github.com/nervosnetwork/ckb/releases/download/v${CKB_VERSION}/ckb_v${CKB_VERSION}_aarch64-unknown-linux-gnu-portable.tar.gz`, bin: 'ckb' },
      'darwin-x64':  { url: `https://github.com/nervosnetwork/ckb/releases/download/v${CKB_VERSION}/ckb_v${CKB_VERSION}_x86_64-apple-darwin.zip`, bin: 'ckb' },
      'darwin-arm64':{ url: `https://github.com/nervosnetwork/ckb/releases/download/v${CKB_VERSION}/ckb_v${CKB_VERSION}_aarch64-apple-darwin.zip`, bin: 'ckb' },
      'win32-x64':   { url: `https://github.com/nervosnetwork/ckb/releases/download/v${CKB_VERSION}/ckb_v${CKB_VERSION}_x86_64-pc-windows-msvc.zip`, bin: 'ckb.exe' },
    },
    rpcPort: 8114,
    syncModes: {
      full:     { label: 'Full sync',           desc: 'Download and verify every block from genesis. Most trustless. Takes days.' },
      trusted:  { label: 'Trusted fast sync',   desc: 'Skip historical block verification. Syncs in hours.' },
      snapshot: { label: 'Snapshot (WI)',        desc: 'Download verified snapshot from snapshots.wyltekindustries.com. Ready in minutes.', url: 'https://snapshots.wyltekindustries.com/latest.json' },
    },
    configTemplate: 'ckb.toml.template',
    tags: ['full-node', 'validator'],
  },
  {
    id: 'fiberNode',
    label: 'Fiber Node',
    icon: '⚡',
    desc: 'CKB payment channel network — Lightning-style micropayments. Requires a funded CKB wallet and a running CKB node.',
    diskGB: 0.5,
    ramMB: 256,
    cpuNote: 'Minimal CPU usage',
    network: 'Yes — P2P port 8228',
    requires: ['ckbNode'],
    binaries: {
      'linux-x64':   { url: `https://github.com/nervosnetwork/fiber/releases/download/v${FIBER_VERSION}/fnn-v${FIBER_VERSION}-x86_64-linux.tar.gz`, bin: 'fnn' },
      'linux-arm64': { url: `https://github.com/nervosnetwork/fiber/releases/download/v${FIBER_VERSION}/fnn-v${FIBER_VERSION}-aarch64-linux.tar.gz`, bin: 'fnn' },
    },
    rpcPort: 8227,
    configTemplate: 'fiber.yml.template',
    tags: ['payment', 'fiber', 'channels'],
  },
  {
    id: 'lightClient',
    label: 'Light Client',
    icon: '🔦',
    desc: 'Lightweight CKB client — syncs block headers only. Low resource use, great for SBCs and laptops. Trustless but not a full validator.',
    diskGB: 0.2,
    ramMB: 128,
    cpuNote: 'Very low — runs on any SBC',
    network: 'Yes — connects to light client peers',
    binaries: {
      'linux-x64':   { url: `https://github.com/nervosnetwork/ckb-light-client/releases/download/v${LIGHT_VERSION}/ckb-light-client-x86_64-unknown-linux-gnu.tar.gz`, bin: 'ckb-light-client' },
      'linux-arm64': { url: `https://github.com/nervosnetwork/ckb-light-client/releases/download/v${LIGHT_VERSION}/ckb-light-client-aarch64-unknown-linux-gnu.tar.gz`, bin: 'ckb-light-client' },
    },
    rpcPort: 9000,
    configTemplate: 'light.toml.template',
    tags: ['light-node', 'low-resource'],
  },
  {
    id: 'stratum',
    label: 'Mining Proxy',
    icon: '⛏',
    desc: 'Stratum proxy — connect ESP32 miners or rigs to a pool. Aggregates multiple miners behind one pool connection.',
    diskGB: 0.01,
    ramMB: 64,
    cpuNote: 'Negligible',
    network: 'Yes — accepts Stratum connections on port 3333',
    bundled: true, // Node.js — no download needed, bundled with CKH
    tags: ['mining', 'stratum'],
  },
];

function getComponentForPlatform(component) {
  if (component.bundled) return { ...component, available: true };
  const bin = component.binaries?.[PLATFORM];
  return { ...component, available: !!bin, downloadUrl: bin?.url, binName: bin?.bin };
}

function getRegistry() {
  return REGISTRY.map(getComponentForPlatform);
}

module.exports = { getRegistry, PLATFORM };
