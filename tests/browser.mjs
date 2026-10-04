// Shared Playwright helpers (system Chrome via playwright-core; real GPU when available).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export async function startServer(dir, port) {
  const serve = path.resolve(dir, 'serve.mjs');
  const script = fs.existsSync(serve) ? serve : path.resolve('scripts/serve.mjs');
  const args = fs.existsSync(serve) ? [script, 'web', String(port)] : [script, path.resolve(dir), String(port)];
  const p = spawn(process.execPath, args, { cwd: fs.existsSync(serve) ? dir : process.cwd(), stdio: 'pipe' });
  await new Promise((res, rej) => { p.stdout.on('data', (d) => String(d).includes('Serving') && res()); p.on('exit', (c) => rej(new Error('server exit ' + c))); setTimeout(res, 3000); });
  return p;
}

export async function launch({ headless = true, width = 1280, height = 720 } = {}) {
  // Windows + system Chrome uses the real GPU (ANGLE/D3D11); elsewhere fall back to a bundled Chromium
  // (CHROME_PATH or the Playwright cache) with SwiftShader WebGL.
  const exe = process.env.CHROME_PATH || (process.platform !== 'win32' && fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
  const browser = await chromium.launch(exe ? {
    executablePath: exe, headless,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--disable-renderer-backgrounding'],
  } : {
    channel: 'chrome', headless,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  return { browser, page, consoleErrors };
}

export async function waitGame(page) {
  await page.waitForFunction(() => window.__game && window.__game.loop, null, { timeout: 30000 });
}
