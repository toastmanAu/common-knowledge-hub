#!/usr/bin/env node
/**
 * CKH SBC Kiosk Launcher
 * Starts the CKH web server then launches Chromium in kiosk mode.
 * Run as a systemd service on Armbian SBC targets.
 */

const { execSync, spawn } = require('child_process');

const PORT = 3000;
const URL  = `http://localhost:${PORT}`;

// Wait for CKH web server to be ready
function waitForServer(url, retries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = setInterval(() => {
      try {
        execSync(`curl -sf ${url} > /dev/null 2>&1`);
        clearInterval(check);
        resolve();
      } catch {
        if (++tries >= retries) { clearInterval(check); reject(new Error('Server timeout')); }
      }
    }, 1000);
  });
}

async function launch() {
  console.log('[kiosk] Waiting for CKH server...');
  await waitForServer(URL);
  console.log('[kiosk] Launching Chromium kiosk...');

  const args = [
    '--kiosk',
    '--no-sandbox',
    '--disable-infobars',
    '--disable-session-crashed-bubble',
    '--disable-restore-session-state',
    '--autoplay-policy=no-user-gesture-required',
    '--check-for-update-interval=31536000',
    '--noerrdialogs',
    '--touch-events=enabled',
    `--app=${URL}`
  ];

  const browser = spawn('chromium-browser', args, { stdio: 'inherit' });
  browser.on('exit', code => {
    console.log(`[kiosk] Chromium exited (${code}) — restarting in 3s`);
    setTimeout(launch, 3000);
  });
}

launch().catch(err => {
  console.error('[kiosk] Fatal:', err.message);
  process.exit(1);
});
