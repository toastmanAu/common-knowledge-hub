# Common Knowledge Hub (CKH)

> Nervos CKB stack launcher — full node, Fiber, light client, mining proxy — all in one.

![CKH](assets/screenshot.png)

## What is CKH?

CKH is a cross-platform desktop app (Electron) that makes running the Nervos CKB stack as easy as clicking a button. No terminal required.

**Manage from one UI:**
- ⛓ **CKB Full Node** — full chain validation, sync from genesis
- ⚡ **Fiber Node** — payment channels and micropayments
- 🔦 **Light Client** — header-only sync, low resource footprint
- ⛏ **Mining Proxy** — Stratum proxy for ESP32 miners or dedicated rigs

## Platforms

| Platform | Architecture | Status |
|----------|-------------|--------|
| Linux | arm64 (Pi, OPi, SBC) | ✅ Primary |
| Linux | x64 (N100, desktop) | ✅ |
| macOS | x64 / arm64 (M-series) | 🔜 |
| Windows | x64 | 🔜 |

## Quick Start

```bash
# Linux — download AppImage
chmod +x CKH-*.AppImage
./CKH-*.AppImage
```

Or build from source:

```bash
git clone https://github.com/toastmanAu/common-knowledge-hub
cd common-knowledge-hub
npm install
npm start
```

## SBC Images

CKH is the basis for Wyltek SBC images — pre-configured board images that boot straight into CKH. Plug in, it finds peers, starts syncing. Zero setup.

Supported boards (planned):
- Raspberry Pi 4/5
- Orange Pi 3B / Zero 3
- NanoPi Neo3

## Config

CKH stores all config and chain data in `~/.ckh/`:

```
~/.ckh/
├── config.json       # app config
├── ckb-data/         # CKB full node chain data
├── fiber-data/       # Fiber node data + keys
└── light-data/       # Light client headers
```

## Bundled Binaries

Binaries are bundled per platform in `bin/<platform-arch>/`:
- `ckb` — CKB full node
- `fnn` — Fiber node
- `ckb-light-client` — CKB light client

Binaries are downloaded on first launch if not bundled.

## License

MIT © [Wyltek Industries](https://wyltekindustries.com)
