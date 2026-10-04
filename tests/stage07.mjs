// Stage 07 checks: everything from stage 06 (classic visuals, ortho) + the new pipeline assets and camera mode:
// pause menu driven by REAL keys/mouse, variant switching, persistence, gameplay invariance across visuals,
// stage-01 core checks + animations under the new assets in weak perspective, turntables, kit dressing, projection.
import fs from 'node:fs';
import path from 'node:path';
import { run as run06 } from './stage06.mjs';
import { runCore, checkWaves } from './core-checks.mjs';
import { playerSequence, monsterSequence, sheetInit, sheetSave } from './stage03.mjs';

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLASSIC = { player: 'classic', monster: 'classic', env: 'classic', camera: 'ortho' };

/** Deterministic scripted fight through the API; returns the sim hash (visuals must not influence it). */
const fightHash = (page) => ev(page, () => {
  const g = __game; g.pause(true); g.reset({ seed: 7, waves: true });
  for (let i = 0; i < 60 * 14; i++) {
    const s = g.sim; const live = s.monsters.filter((m) => m.state !== 'dead' && m.vis.visible).sort((a, b) => a.vis.dist - b.vis.dist);
    if (live[0]) g.aimAt(live[0].pos.x, live[0].pos.z);
    g.fire(!!live[0] && live[0].vis.dist < 8); g.move(i % 300 < 150 ? 1 : -1, i % 200 < 100 ? 0.5 : -0.5);
    g.step(1, i % 20 === 0);
  }
  g.fire(false); g.move(0, 0); g.step(1);
  return { hash: g.debug.hash(), kills: g.sim.stats.kills, tick: g.sim.tick, hp: g.sim.player.hp };
});

async function silhouette(page, kind, variant, override) {
  return ev(page, async ([kind, variant, override]) => {
    const url = __game.debug.turntable(kind, override, { analysis: true, cell: 220, variant, closeHalf: kind === 'player' ? 1.15 : 1.9 });
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const out = [];
    for (let i = 0; i < 8; i++) {
      const d = g.getImageData(i * 220, 0, 220, 220).data;
      let minY = 220, maxY = -1, n = 0;
      for (let y = 0; y < 220; y++) for (let x = 0; x < 220; x++) { const k = (y * 220 + x) * 4; if (!(d[k] > 200 && d[k + 1] < 60 && d[k + 2] > 200)) { n++; minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }
      out.push({ h: maxY - minY + 1, px: n, data: Array.from(d) });
    }
    return out;
  }, [kind, variant, override]);
}

export async function run(page, log, out) {
  await run06(page, log, out);
  const { check } = log;

  // ------------------------------------------------------------------ pause menu with real keyboard + mouse
  await ev(page, async (c) => { await __game.settings.set(c); __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.pause(false); }, CLASSIC);
  await page.mouse.move(640, 300);
  await page.keyboard.press('Escape');
  const t0 = await ev(page, () => __game.sim.tick); await sleep(400);
  const m0 = await ev(page, () => ({ open: __game.state().menuOpen, paused: __game.state().paused, tick: __game.sim.tick, visible: getComputedStyle(document.getElementById('pause-menu')).display !== 'none' }));
  check('pause menu: real Esc opens the menu and freezes the simulation', m0.open && m0.paused && m0.visible && m0.tick === t0, m0);
  await page.screenshot({ path: path.join(out, 'pause_menu.png') });
  const picks = [['player', 'vanguard'], ['monster', 'reaver'], ['env', 'kit2'], ['camera', 'persp']];
  for (const [k, v] of picks) {
    await page.click(`#pause-menu button[data-key="${k}"][data-val="${v}"]`); // real mouse click
    await page.waitForFunction(([k, v]) => __game.settings.active()[k === 'camera' ? 'camera' : k] === v, [k, v], { timeout: 20000 });
  }
  // lens: focus the slider with a real click and step it with real arrow keys (14° -> 10°)
  await page.click('#pm-fov');
  await ev(page, async () => { await __game.settings.set({ fov: 14 }); });
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => Math.abs(__game.camera().fov - 10) < 0.01, null, { timeout: 5000 });
  const a1 = await ev(page, () => ({ active: __game.settings.active(), set: __game.settings.get(), assets: __game.assets().loaded, cam: __game.camera(), errors: __game.errors() }));
  check('pause menu: real clicks switch player/monster/environment/camera and the lens slider; assets load without errors',
    a1.active.player === 'vanguard' && a1.active.monster === 'reaver' && a1.active.env === 'kit2' && a1.active.camera === 'persp' && a1.set.fov === 10 && a1.assets.every((x) => x.loaded) && a1.errors.length === 0, a1);
  await page.screenshot({ path: path.join(out, 'pause_menu_new.png') });
  await page.keyboard.press('Escape');
  const t1 = await ev(page, () => __game.sim.tick); await sleep(300);
  const m1 = await ev(page, () => ({ open: __game.state().menuOpen, paused: __game.state().paused, tick: __game.sim.tick }));
  check('pause menu: real Esc closes the menu and resumes the simulation', !m1.open && !m1.paused && m1.tick > t1, m1);

  // ------------------------------------------------------------------ weak perspective camera: fixed angles, long lens, no rotation
  const cA = await ev(page, () => __game.camera());
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
  await page.mouse.move(200, 600); await sleep(200); await page.mouse.move(1100, 150); await sleep(200);
  const cB = await ev(page, () => __game.camera());
  check('weak perspective: PerspectiveCamera, fixed yaw 45° / pitch ≈41.5° (same as iso), long lens (≥ 85 mm eq.), framing distance matches, no rotation while moving/aiming',
    cA.type === 'PerspectiveCamera' && Math.abs(cA.yawDeg - 45) < 0.05 && Math.abs(cA.pitchDeg - 41.47) < 0.1 && cA.focal35mm >= 85 && Math.abs(cA.distance - cA.expectedDistance) < 0.05 &&
    Math.abs(cB.yawDeg - cA.yawDeg) < 1e-6 && Math.abs(cB.pitchDeg - cA.pitchDeg) < 1e-6, { before: cA, after: cB });
  // projection: vertical extent of a 3 m pole at the left vs right screen edge — equal in ortho, slightly different in perspective
  const proj = await ev(page, async () => {
    const g = __game; g.pause(true); g.reset({ waves: false, player: { x: 0, z: 2 } }); g.step(1);
    const pole = (x, z) => { const a = g.view.worldToScreen(x, 0, z), b = g.view.worldToScreen(x, 3, z); return Math.hypot(b.x - a.x, b.y - a.y); };
    const lr = () => { const near = pole(5, 7), far = pole(-5, -3); return { near: +near.toFixed(2), far: +far.toFixed(2), ratio: +(near / far).toFixed(4) }; };
    const persp = lr();
    await g.settings.set({ camera: 'ortho' }); const ortho = lr();
    await g.settings.set({ camera: 'persp' });
    return { persp, ortho };
  });
  check('projection: ortho keeps sizes constant across the screen; weak perspective differs slightly (near-iso, not orthographic)',
    Math.abs(proj.ortho.ratio - 1) < 1e-3 && proj.persp.ratio > 1.01 && proj.persp.ratio < 1.25, proj);

  // ------------------------------------------------------------------ persistence (localStorage) across reload
  await page.reload(); await page.waitForFunction(() => window.__game && window.__game.loop, null, { timeout: 30000 });
  const pr = await ev(page, () => ({ active: __game.settings.active(), cam: __game.camera().type, errors: __game.errors() }));
  check('settings persist across page reload (assets preloaded before the first frame)', pr.active.player === 'vanguard' && pr.active.env === 'kit2' && pr.cam === 'PerspectiveCamera' && pr.errors.length === 0, pr);

  // ------------------------------------------------------------------ stage-01 core checks under the new assets + weak perspective
  await runCore(page, log, 'new assets + weak perspective');
  await checkWaves(page, log, 'new assets + weak perspective');

  // ------------------------------------------------------------------ gameplay invariance across visual settings
  await ev(page, async (c) => { await __game.settings.set(c); }, CLASSIC);
  const hClassic = await fightHash(page);
  await ev(page, async () => { await __game.settings.set({ player: 'vanguard', monster: 'reaver', env: 'kit2', camera: 'persp', fov: 12 }); });
  const hNew = await fightHash(page);
  check('combat result identical with classic/ortho and new assets/weak perspective (same sim hash)', hClassic.hash === hNew.hash && hClassic.tick === hNew.tick, { classic: hClassic, new: hNew });

  // ------------------------------------------------------------------ animations on the new rigs (shared IK animation code)
  await sheetInit(page);
  await playerSequence(page, log, ' [Vanguard, weak perspective]', true);
  await monsterSequence(page, log, ' [Reaver, weak perspective]', true);
  await sheetSave(page, path.join(out, 'anim_new_assets.png'));
  await ev(page, () => __game.debug.zoom());

  // ------------------------------------------------------------------ 8-angle turntables + programmable palette change
  for (const [kind, variant] of [['player', 'vanguard'], ['monster', 'reaver']]) {
    const url = await ev(page, ([k, v]) => __game.debug.turntable(k, undefined, { variant: v, closeHalf: k === 'player' ? 1.15 : 1.9, center: k === 'player' ? 0.95 : 0.85 }), [kind, variant]);
    fs.writeFileSync(path.join(out, `turntable_${variant}.png`), Buffer.from(url.split(',')[1], 'base64'));
    const m = await silhouette(page, kind, variant);
    const hs = m.map((c) => c.h), px = m.map((c) => c.px);
    const hVar = (Math.max(...hs) - Math.min(...hs)) / Math.max(...hs);
    check(`${variant}: visible in all 8 angles, proportions stable (silhouette height)`, px.every((p) => p > 2000) && hVar < 0.3, { heights: hs, pixels: px, heightVariation: +hVar.toFixed(3) });
  }
  const recolor = { palette: { accent: '#1f8fff' } };
  const before = await silhouette(page, 'player', 'vanguard'), after = await silhouette(page, 'player', 'vanguard', recolor);
  const diffs = before.map((b, i) => { let n = 0; for (let k = 0; k < b.data.length; k += 4) if (Math.abs(b.data[k] - after[i].data[k]) + Math.abs(b.data[k + 2] - after[i].data[k + 2]) > 60) n++; return n; });
  const url = await ev(page, (o) => __game.debug.turntable('player', o, { variant: 'vanguard', closeHalf: 1.15, center: 0.95 }), recolor);
  fs.writeFileSync(path.join(out, 'turntable_vanguard_recolor.png'), Buffer.from(url.split(',')[1], 'base64'));
  check('vanguard: palette change through the shared spec (accent red→blue) applies consistently from all 8 angles, geometry unchanged', diffs.every((d) => d > 80) && before.every((b, i) => Math.abs(b.px - after[i].px) < b.px * 0.01), { changedPixelsPerAngle: diffs, silhouettePx: before.map((b, i) => [b.px, after[i].px]) });

  // ------------------------------------------------------------------ environment kit: fitted dressing, lamps, drone light still changes the frame
  const env = await ev(page, () => { const g = __game; g.pause(true); g.reset({ waves: false, player: { x: 0, z: 2 } }); g.step(1); return { scene: g.scene(), practicals: g.view.lighting.practicals.length }; });
  check('environment kit: instanced kit pieces fitted to every obstacle, lamp sockets drive practical lights', env.scene.env === 'kit2' && env.scene.lamps >= 40 && env.practicals >= 16 && env.scene.tris > 300000, { lamps: env.scene.lamps, practicals: env.practicals, tris: env.scene.tris, drawCalls: env.scene.drawCalls, meshes: env.scene.meshes });

  // ------------------------------------------------------------------ evidence frames
  const shot = async (name, cam) => {
    await ev(page, async (cam) => {
      await __game.settings.set({ camera: cam }); const g = __game; g.pause(true); g.reset({ seed: 4, waves: true });
      for (let i = 0; i < 60 * 9; i++) {
        const s = g.sim; const live = s.monsters.filter((m) => m.state !== 'dead' && m.vis.visible).sort((a, b) => a.vis.dist - b.vis.dist);
        if (live[0]) g.aimAt(live[0].pos.x, live[0].pos.z);
        g.fire(!!live[0] && live[0].vis.dist < 7); g.move(i % 240 < 120 ? 1 : -1, 0); g.step(1, i > 60 * 9 - 200);
      }
      g.step(1); g.fire(false); g.move(0, 0);
    }, cam);
    await page.screenshot({ path: path.join(out, name) });
  };
  await shot('gameplay_new_persp.png', 'persp');
  await shot('gameplay_new_ortho.png', 'ortho');
  for (const [name, x, z] of [['env_ruins', -11.5, -9], ['env_gate', 0, -17.5], ['env_cover', -6.5, -4.5]]) {
    await ev(page, ([x, z]) => { __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.debug.zoom(4.5); __game.debug.focus(x, z); __game.step(2); }, [x, z]);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  }
  await ev(page, () => { __game.debug.focus(); __game.debug.zoom(); });
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(await ev(page, () => ({ state: __game.state(), camera: __game.camera(), assets: __game.assets(), scene: __game.scene() })), null, 1));
  check('no runtime errors after stage-07 checks', (await ev(page, () => __game.errors())).length === 0, { errors: await ev(page, () => __game.errors()) });
  // leave persisted settings on the new assets: the e2e "after reload" pass then repeats the core checks in that mode
  await ev(page, async () => { await __game.settings.set({ player: 'vanguard', monster: 'reaver', env: 'kit2', camera: 'persp', fov: 14 }); __game.pause(true); });
}
