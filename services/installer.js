// services/installer.js — Download, extract, verify components
const { EventEmitter } = require('events');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const CKH_DIR = path.join(os.homedir(), '.ckh');
const BIN_DIR = path.join(CKH_DIR, 'bin');

class Installer extends EventEmitter {
  constructor() {
    super();
    if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  isInstalled(component) {
    if (component.bundled) return true;
    const binPath = path.join(BIN_DIR, component.id, component.binName || component.id);
    return fs.existsSync(binPath);
  }

  getBinPath(component) {
    if (component.bundled) return null; // handled by main.js
    return path.join(BIN_DIR, component.id, component.binName || component.id);
  }

  async install(component) {
    if (!component.downloadUrl) throw new Error(`No download URL for ${component.id} on this platform`);

    const destDir = path.join(BIN_DIR, component.id);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const url = component.downloadUrl;
    const filename = url.split('/').pop();
    const tmpFile = path.join(os.tmpdir(), `ckh-${component.id}-${filename}`);

    this.emit('progress', { id: component.id, phase: 'downloading', pct: 0 });

    // Download
    await this._download(url, tmpFile, (pct) => {
      this.emit('progress', { id: component.id, phase: 'downloading', pct });
    });

    this.emit('progress', { id: component.id, phase: 'extracting', pct: 0 });

    // Extract
    await this._extract(tmpFile, destDir, filename);
    fs.unlinkSync(tmpFile);

    // Make binary executable
    const binPath = path.join(destDir, component.binName || component.id);
    if (fs.existsSync(binPath)) {
      fs.chmodSync(binPath, 0o755);
    } else {
      // Binary might be in a subdirectory — find it
      const found = this._findBin(destDir, component.binName || component.id);
      if (found && found !== binPath) {
        fs.renameSync(found, binPath);
        fs.chmodSync(binPath, 0o755);
      }
    }

    this.emit('progress', { id: component.id, phase: 'done', pct: 100 });
    return binPath;
  }

  async uninstall(component) {
    const destDir = path.join(BIN_DIR, component.id);
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    this.emit('uninstalled', { id: component.id });
  }

  _download(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      const get = url.startsWith('https') ? https : http;

      const request = (u) => {
        get.get(u, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            return request(res.headers.location); // follow redirect
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }

          const total = parseInt(res.headers['content-length'] || '0');
          let received = 0;

          res.on('data', (chunk) => {
            received += chunk.length;
            file.write(chunk);
            if (total > 0) onProgress(Math.round((received / total) * 100));
          });

          res.on('end', () => { file.end(); resolve(); });
          res.on('error', reject);
        }).on('error', reject);
      };

      request(url);
    });
  }

  async _extract(filePath, destDir, filename) {
    const ext = filename.endsWith('.tar.gz') ? 'tar.gz'
              : filename.endsWith('.tar.xz') ? 'tar.xz'
              : filename.endsWith('.zip')    ? 'zip'
              : null;

    if (!ext) throw new Error(`Unknown archive format: ${filename}`);

    if (ext === 'zip') {
      // Use unzip or PowerShell on Windows
      if (process.platform === 'win32') {
        await execFileAsync('powershell', ['-Command', `Expand-Archive -Path "${filePath}" -DestinationPath "${destDir}" -Force`]);
      } else {
        await execFileAsync('unzip', ['-o', filePath, '-d', destDir]);
      }
    } else {
      // tar -xf handles both .tar.gz and .tar.xz
      await execFileAsync('tar', ['-xf', filePath, '-C', destDir, '--strip-components=1']);
    }
  }

  _findBin(dir, name) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile() && (e.name === name || e.name === name + '.exe')) return full;
      if (e.isDirectory()) {
        const found = this._findBin(full, name);
        if (found) return found;
      }
    }
    return null;
  }
}

module.exports = new Installer();
