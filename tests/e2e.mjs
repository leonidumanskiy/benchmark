// Stage verification runner. Usage: node tests/e2e.mjs --dir <web root or unpacked build> --out <evidence dir> [--stage 1] [--port 8090]
import fs from 'node:fs';
import path from 'node:path';
import { launch, startServer, waitGame } from './browser.mjs';
import { makeLog, runCore, checkWaves } from './core-checks.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('dir', 'dist'), out = arg('out', 'evidence/tmp'), stage = Number(arg('stage', 1)), port = Number(arg('port', 8090));
fs.mkdirSync(out, { recursive: true });
const url = `http://localhost:${port}/`;
const server = await startServer(dir, port);
const log = makeLog();
const extra = stage > 1 ? await import(`./stage${String(stage).padStart(2, '0')}.mjs`) : null;
let browser;
try {
  // ---- run 1
  let L = await launch(); browser = L.browser; const page = L.page;
  await page.goto(url); await waitGame(page);
  const info = await page.evaluate(() => { const gl = __game.view.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return { stage: __game.stage, gl: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?' }; });
  log.check('boot: game API present, stage tag', !!info.stage, info);
  await runCore(page, log, 'run1');
  await checkWaves(page, log, 'run1');
  if (extra) await extra.run(page, log, out);
  else await stage01Evidence(page, out);
  // ---- reload
  await page.reload(); await waitGame(page);
  await runCore(page, log, 'after reload');
  log.check('no runtime errors (run1 + reload)', (await page.evaluate(() => __game.errors())).length === 0 && L.consoleErrors.length === 0, { errors: await page.evaluate(() => __game.errors()), console: L.consoleErrors });
  await browser.close();
  // ---- full relaunch (new browser process)
  L = await launch(); browser = L.browser;
  await L.page.goto(url); await waitGame(L.page);
  await runCore(L.page, log, 'relaunch');
  log.check('no runtime errors (relaunch)', (await L.page.evaluate(() => __game.errors())).length === 0 && L.consoleErrors.length === 0, { console: L.consoleErrors });
  await browser.close();
} catch (e) {
  log.check('runner exception', false, { error: String(e.stack || e) });
  try { await browser?.close(); } catch {}
} finally {
  server.kill();
}
const passed = log.results.filter((r) => r.ok).length;
const summary = { url, dir, stage, passed, failed: log.results.length - passed, results: log.results };
fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(summary, null, 1));
console.log(`\n${passed}/${log.results.length} checks passed`);
process.exit(summary.failed ? 1 : 0);

async function stage01Evidence(page, out) {
  // combat frame: wave running, overlay on, a tracer in flight
  await page.evaluate(() => { __game.reset({ seed: 2, waves: true }); __game.pause(true); __game.debug.overlay(true); });
  await page.evaluate(() => {
    for (let i = 0; i < 60 * 9; i++) {
      const s = __game.sim; const live = s.monsters.filter((m) => m.state !== 'dead' && m.vis.visible).sort((a, b) => a.vis.dist - b.vis.dist);
      if (live[0]) __game.aimAt(live[0].pos.x, live[0].pos.z);
      __game.fire(!!live[0] && live[0].vis.dist < 9);
      __game.step(1, false);
    }
    __game.step(1);
  });
  await page.screenshot({ path: path.join(out, 'combat_debug.png') });
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(await page.evaluate(() => ({ state: __game.state(), visibility: __game.visibility() })), null, 1));
  await page.evaluate(() => { __game.fire(false); __game.debug.overlay(false); __game.step(1); });
  await page.screenshot({ path: path.join(out, 'gameplay.png') });
}
