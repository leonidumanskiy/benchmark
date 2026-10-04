// Stage 05 checks: drone light changes the image/shadows (gameplay unchanged), light never reveals hidden monsters,
// visible monsters stay readable, gunfire lights the scene, debug overlays off in normal play.
import fs from 'node:fs';
import path from 'node:path';

const ev = (page, fn, arg) => page.evaluate(fn, arg);

/** grab the WebGL canvas downscaled to W (after a render), luminance array */
const FRAME = `(() => { const cv = __game.view.renderer.domElement; const W = 320, H = Math.round(320 * cv.height / cv.width);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(cv, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data; const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return { W, H, L }; })()`;

export async function run(page, { check }, out) {
  // ---------------------------------------------------------------- 1. debug overlays off in normal play; F3 toggles with a real key
  const dbg = await ev(page, () => { __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.debug.spawn(-1, -2, { dummy: true }); __game.step(2);
    return { overlay: __game.view.overlay.visible, labels: document.getElementById('debug-labels').innerHTML.length, panel: getComputedStyle(document.getElementById('debug-panel')).display, flag: __game.view.debug }; });
  await page.keyboard.press('F3');
  const dbgOn = await ev(page, () => { __game.step(1); return { overlay: __game.view.overlay.visible, labels: document.getElementById('debug-labels').innerHTML.length, panel: getComputedStyle(document.getElementById('debug-panel')).display }; });
  await page.keyboard.press('F3');
  const dbgOff = await ev(page, () => { __game.step(1); return { overlay: __game.view.overlay.visible, labels: document.getElementById('debug-labels').innerHTML.length, panel: getComputedStyle(document.getElementById('debug-panel')).display }; });
  check('debug overlays disabled in normal play (F3 toggles them on/off)', !dbg.overlay && dbg.labels === 0 && dbg.panel === 'none' && !dbg.flag && dbgOn.overlay && dbgOn.labels > 0 && dbgOn.panel === 'block' && !dbgOff.overlay && dbgOff.labels === 0 && dbgOff.panel === 'none', { normal: dbg, on: dbgOn, off: dbgOff });

  // ---------------------------------------------------------------- 2. drone flies continuously (real-time) through the arena
  const flight = await ev(page, async () => {
    __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.debug.drone({ at: null, freeze: false });
    __game.pause(false);
    const pts = [];
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 400)); pts.push({ ...__game.debug.lighting().drone, t: __game.debug.lighting().droneT }); }
    __game.pause(true);
    // sample the whole loop
    const L = __game.view.lighting; const samples = [];
    for (let t = 0; t < 120; t += 2) { const p = L.dronePos(t); samples.push([p.x, p.z]); }
    return { pts, maxAbs: Math.max(...samples.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z)))), uniq: new Set(samples.map(([x, z]) => `${Math.round(x)},${Math.round(z)}`)).size };
  });
  const moved = flight.pts.every((p, i) => i === 0 || Math.hypot(p.x - flight.pts[i - 1].x, p.z - flight.pts[i - 1].z) > 0.3);
  check('drone flies continuously in real time along a patrol covering the arena', moved && flight.maxAbs < 16 && flight.uniq > 30, flight);

  // ---------------------------------------------------------------- 3. drone pass visibly changes the image + shadows; gameplay untouched
  const pass = await ev(page, (FRAME) => {
    __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.aimAt(4, -3); __game.debug.drone({ freeze: true });
    const h0 = __game.debug.hash();
    const frames = [];
    for (const at of [{ x: -6.5, z: -3 }, { x: 2.5, z: 6 }, null]) {
      __game.debug.drone({ at, t: 0 }); __game.step(1);
      frames.push(eval(FRAME));
    }
    const diff = (a, b) => { let n = 0, s = 0; for (let i = 0; i < a.L.length; i++) { const d = Math.abs(a.L[i] - b.L[i]); s += d; if (d > 0.08) n++; } return { frac: n / a.L.length, mean: s / a.L.length }; };
    // luminance around the lit spot (cover_a at -6,-5 receives light + casts shadow)
    const spot = (f, x, z) => { const s = __game.view.worldToScreen(x, 0, z); const r = __game.view.renderer.domElement.getBoundingClientRect(); const px = Math.round((s.x - r.left) / r.width * f.W), py = Math.round((s.y - r.top) / r.height * f.H); let sum = 0, n = 0; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const i = (py + dy) * f.W + px + dx; if (i >= 0 && i < f.L.length) { sum += f.L[i]; n++; } } return sum / n; };
    const lumA_atA = spot(frames[0], -6.5, -3), lumA_atB = spot(frames[1], -6.5, -3);
    const hDrone = __game.debug.hash();
    // reference run: identical inputs/steps, drone never moved
    __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.aimAt(4, -3); for (let k = 0; k < 3; k++) __game.step(1);
    return { d01: diff(frames[0], frames[1]), lumA_atA, lumA_atB, hashSame: __game.debug.hash() === hDrone, hDrone, hRef: __game.debug.hash() };
  }, FRAME);
  check('drone light pass changes the image noticeably (lit pool + moving shadows) while gameplay state is unchanged', pass.d01.frac > 0.02 && pass.lumA_atA > pass.lumA_atB * 2 && pass.hashSame, pass);
  await ev(page, () => { __game.debug.drone({ at: { x: -6.5, z: -3 } }); __game.step(1); });
  await page.screenshot({ path: path.join(out, 'drone_pass_a.png') });
  await ev(page, () => { __game.debug.drone({ at: { x: 2.5, z: 6 } }); __game.step(1); });
  await page.screenshot({ path: path.join(out, 'drone_pass_b.png') });

  // ---------------------------------------------------------------- 4. light and gameplay visibility are independent
  const indep = await ev(page, (FRAME) => {
    // monster behind the player (outside sector, beyond near radius) directly under the drone light
    __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.aimAt(6, 2);
    __game.debug.drone({ at: { x: -6, z: 2.5 }, freeze: true }); __game.step(2);
    const empty = eval(FRAME);
    const id = __game.debug.spawn(-6, 2.5, { dummy: true }); __game.render(); // dt = 0: only the new monster differs
    const withHidden = eval(FRAME);
    const vis = __game.visibility().find((v) => v.id === id);
    const cov = __game.coverage()[id];
    let n = 0; const where = []; for (let i = 0; i < empty.L.length; i++) if (Math.abs(empty.L[i] - withHidden.L[i]) > 0.03) { n++; if (where.length < 5) where.push([i % empty.W, Math.floor(i / empty.W)]); }
    // lit: luminance at that spot vs drone elsewhere
    const s = __game.view.worldToScreen(-6, 0, 2.5); const r = __game.view.renderer.domElement.getBoundingClientRect();
    const px = Math.round((s.x - r.left) / r.width * empty.W), py = Math.round((s.y - r.top) / r.height * empty.H);
    const lum = (f) => { let a = 0, k = 0; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { a += f.L[(py + dy) * f.W + px + dx]; k++; } return a / k; };
    const litLum = lum(withHidden);
    __game.debug.drone({ at: { x: 10, z: -10 } }); __game.step(1);
    const darkLum = lum(eval(FRAME));
    // now let gameplay reveal it (aim at it): it must appear and be lit
    __game.aimAt(-6, 2.5); __game.debug.drone({ at: { x: -6, z: 2.5 } }); __game.step(2);
    const vis2 = __game.visibility().find((v) => v.id === id); const cov2 = __game.coverage()[id];
    return { hidden: { visible: vis.visible, reason: vis.reason, rendered: vis.rendered, pixels: cov.full, changedPixelsVsEmpty: n, where }, litLum, darkLum, revealed: { visible: vis2.visible, rendered: vis2.rendered, pixels: cov2.full } };
  }, FRAME);
  check('lit-but-hidden monster stays hidden (no pixels, no shadow leak); revealing is gameplay-driven only', !indep.hidden.visible && !indep.hidden.rendered && indep.hidden.pixels === 0 && indep.hidden.changedPixelsVsEmpty === 0 && indep.litLum > indep.darkLum * 2 && indep.revealed.visible && indep.revealed.pixels > 50, indep);
  await ev(page, () => { __game.aimAt(6, 2); __game.step(2); });
  await page.screenshot({ path: path.join(out, 'lit_hidden_monster.png') });

  // ---------------------------------------------------------------- 5. readability: visible monsters' pixels are not lost in the dark
  const read = await ev(page, (FRAME) => {
    const res = [];
    __game.reset({ waves: false, player: { x: 0, z: 2 } });
    const ids = [__game.debug.spawn(-1.5, 4, { dummy: true }), __game.debug.spawn(4, -2.5, { dummy: true }), __game.debug.spawn(6, -6.5, { dummy: true })];
    __game.aimAt(5, -4);
    for (const t of [0, 9, 18, 27]) {
      __game.debug.drone({ at: null, t }); __game.step(2);
      const f = eval(FRAME); const m = __game.monsterMask(320);
      for (let k = 0; k < m.ids.length; k++) {
        let s = 0, n = 0, mx = 0; for (let i = 0; i < m.mask.length; i++) if (m.mask[i] === k + 1) { s += f.L[i]; n++; if (f.L[i] > mx) mx = f.L[i]; }
        if (n > 0) res.push({ t, id: m.ids[k], px: n, mean: +(s / n).toFixed(3), max: +mx.toFixed(3) });
      }
      // dark background around for contrast
    }
    let bg = 0; const f0 = eval(FRAME); for (let i = 0; i < f0.L.length; i++) bg += f0.L[i]; bg /= f0.L.length;
    return { res, frameMean: +bg.toFixed(3) };
  }, FRAME);
  const minMean = Math.min(...read.res.map((r) => r.mean)), minMax = Math.min(...read.res.map((r) => r.max));
  check('visible monsters stay readable at every drone phase (pixel luminance well above the dark frame mean)', read.res.length >= 8 && minMean > read.frameMean * 1.3 && minMax > 0.35, { minMean, minMax, frameMean: read.frameMean, samples: read.res.length });

  // ---------------------------------------------------------------- 6. gunfire lights the surroundings briefly
  const gun = await ev(page, (FRAME) => {
    __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.aimAt(-4, 6); __game.debug.drone({ at: { x: 12, z: -12 } }); __game.step(2);
    const a = eval(FRAME);
    __game.fire('click'); __game.step(1);
    const b = eval(FRAME);
    __game.step(20); const c = eval(FRAME);
    const s = __game.view.worldToScreen(0, 0, 2); const r = __game.view.renderer.domElement.getBoundingClientRect();
    const px = Math.round((s.x - r.left) / r.width * a.W), py = Math.round((s.y - r.top) / r.height * a.H);
    const lum = (f) => { let t = 0, k = 0; for (let dy = -25; dy <= 25; dy++) for (let dx = -25; dx <= 25; dx++) { const i = (py + dy) * f.W + px + dx; if (i >= 0 && i < f.L.length) { t += f.L[i]; k++; } } return t / k; };
    return { before: +lum(a).toFixed(4), flash: +lum(b).toFixed(4), after: +lum(c).toFixed(4) };
  }, FRAME);
  check('muzzle flash briefly lights the area around the shooter, then fades', gun.flash > gun.before * 1.15 && Math.abs(gun.after - gun.before) < gun.before * 0.08, gun);

  // ---------------------------------------------------------------- evidence: final look
  await ev(page, () => {
    __game.debug.drone({ at: null, freeze: false, t: 6 });
    __game.reset({ seed: 4, waves: true }); __game.pause(true);
    for (let i = 0; i < 60 * 11; i++) {
      const s = __game.sim; const live = s.monsters.filter((m) => m.state !== 'dead' && m.vis.visible).sort((a, b) => a.vis.dist - b.vis.dist);
      if (live[0]) __game.aimAt(live[0].pos.x, live[0].pos.z);
      __game.fire(!!live[0] && live[0].vis.dist < 8); __game.move(Math.sin(i / 90) * 0.7, Math.cos(i / 120) * 0.5);
      __game.step(1);
    }
    for (let i = 0; i < 10; i++) { __game.step(1); if (__game.sim.tick - __game.sim.player.lastShotTick === 1) break; }
    __game.fire(false); __game.move(0, 0);
  });
  await page.screenshot({ path: path.join(out, 'final_combat.png') });
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(await ev(page, () => ({ state: __game.state(), lighting: __game.debug.lighting(), fx: __game.debug.fxStats() })), null, 1));
  await ev(page, () => __game.debug.drone({ at: null, freeze: false }));
}
