// Audio check: real browser input unlocks the AudioContext, game events trigger procedural sounds that produce signal,
// mute works, and nothing errors. Usage: node tests/audio.mjs [--dir dist] [--port 8095]
import { launch, startServer, waitGame } from './browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('dir', 'dist'), port = Number(arg('port', 8095));
const server = await startServer(dir, port);
const { browser, page, consoleErrors } = await launch();
const results = []; const check = (name, ok, data) => { results.push({ name, ok: !!ok, data }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, data !== undefined ? JSON.stringify(data) : ''); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await page.goto(`http://localhost:${port}/`); await waitGame(page);
  check('audio context not created before a user gesture', (await page.evaluate(() => __game.audio.info().ctx)) === 'none');
  // real mouse: move + hold fire toward an empty area, real keyboard: walk
  await page.mouse.move(640, 200);
  await page.mouse.down(); await sleep(600); await page.mouse.up();
  const afterFire = await page.evaluate(() => ({ info: __game.audio.info(), peak: __game.audio.peak() }));
  check('real click unlocks a running AudioContext', afterFire.info.ctx === 'running', afterFire.info.ctx);
  check('gunshots played on real mouse fire', afterFire.info.played.shot >= 3, afterFire.info.played);
  check('gunfire produces audible signal', afterFire.peak > 0.05, afterFire.peak);
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  check('footsteps while walking (real WASD)', (await page.evaluate(() => __game.audio.info().played.step ?? 0)) >= 2);
  // combat sounds: spawn a monster in front of the player and shoot it until it dies
  const combat = await page.evaluate(async () => {
    const g = __game; g.reset({ waves: false, player: { x: 0, z: 2 } }); g.audio.peak();
    const id = g.debug.spawn(0, -2, {}); g.aimAt(0, -2); g.fire(true);
    await new Promise((r) => setTimeout(r, 1200)); g.fire(false);
    return { info: g.audio.info(), peak: g.audio.peak(), alive: g.sim.monsters.filter((m) => m.id === id && m.state !== 'dead').length };
  });
  check('monster hit + death sounds', combat.info.played.monster_hit >= 1 && combat.info.played.monster_killed >= 1 && combat.alive === 0, combat.info.played);
  // impacts on cover: shoot a wall/rock
  const imp = await page.evaluate(async () => {
    const g = __game; g.reset({ waves: false });
    const ob = g.sim.obstacles[0]; const s = ob.shape;
    g.aimAt(s.cx, s.cz); g.fire(true); await new Promise((r) => setTimeout(r, 500)); g.fire(false);
    return { mat: ob.material, played: g.audio.info().played };
  });
  check('surface impact sound on cover', Object.keys(imp.played).some((k) => k.startsWith('impact_')), imp);
  // waves: spawn growls + wave alarm
  const waves = await page.evaluate(async () => { const g = __game; g.reset({ waves: true }); await new Promise((r) => setTimeout(r, 3500)); return g.audio.info().played; });
  check('wave start alarm + spawn growls', waves.wave_start >= 1 && waves.monster_spawn >= 1, waves);
  // mute via real M key
  await page.keyboard.press('KeyM'); await sleep(200); await page.evaluate(() => __game.audio.peak());
  const muted = await page.evaluate(() => __game.audio.info().muted);
  await page.keyboard.press('KeyM');
  check('M toggles mute', muted === true && (await page.evaluate(() => __game.audio.info().muted)) === false);
  const errs = await page.evaluate(() => __game.errors());
  check('no runtime errors', errs.length === 0 && consoleErrors.length === 0, { errs, consoleErrors });
} catch (e) { check('runner exception', false, String(e.stack || e)); }
finally { await browser.close(); server.kill(); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} audio checks passed`);
process.exit(failed ? 1 : 0);
