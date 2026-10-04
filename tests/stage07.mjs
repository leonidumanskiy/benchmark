// Stage 07 checks: everything from stage 06 + HD assets (player / monster / environment kit) and the weak-perspective
// camera, all switched through the in-game pause menu with REAL keyboard/mouse input.
import fs from 'node:fs';
import path from 'node:path';
import { run as run06 } from './stage06.mjs';
import { checkMovement, checkEightTargets, checkVisibility } from './core-checks.mjs';

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickSetting(page, key, value) {
  const b = page.locator(`#pause-menu button[data-setting="${key}"][data-value="${value}"]`);
  await b.click();
}
async function waitSettled(page) {
  await page.waitForFunction(() => { const i = __game.settings.info(); const s = i.settings;
    return (s.player !== 'hd' || i.playerSkin === 'hd') && (s.env !== 'hd' || i.envHd) && (s.monster !== 'hd' || i.hd.monster); }, null, { timeout: 90000 });
}
const shot = async (page, out, name) => { if (out) await page.screenshot({ path: path.join(out, name), timeout: 180000 }); };

export async function run(page, log, out, { skipPrevious = false } = {}) {
  if (!skipPrevious) await run06(page, log, out);
  const { check } = log;
  await ev(page, () => { localStorage.removeItem('kepler.settings.v1'); });
  await page.reload(); await page.waitForFunction(() => window.__game && window.__game.loop);
  await ev(page, runScriptedSrc);

  // ---------------------------------------------------------------- 1. defaults: classic visuals, orthographic iso
  const d0 = await ev(page, () => __game.settings.info());
  check('defaults: classic player/monster/environment, orthographic camera', d0.settings.player === 'classic' && d0.settings.monster === 'classic' && d0.settings.env === 'classic' && d0.camera === 'OrthographicCamera' && d0.playerSkin === 'classic', d0);
  const hashClassic = await ev(page, () => runScripted());
  const hashClassic2 = await ev(page, () => runScripted());
  check('control: scripted fight is deterministic (classic twice)', hashClassic.hash === hashClassic2.hash, { a: hashClassic.hash, b: hashClassic2.hash });

  // ---------------------------------------------------------------- 2. Esc opens the pause menu (real key), game pauses
  await ev(page, () => { __game.pause(false); __game.reset({ waves: false, player: { x: 0, z: 2 } }); });
  await page.keyboard.press('Escape');
  const m1 = await ev(page, async () => { const t0 = __game.sim.tick; await new Promise((r) => setTimeout(r, 300)); return { open: __game.settings.menu(), visible: getComputedStyle(document.getElementById('pause-menu')).display, paused: __game.loop.paused, ticks: __game.sim.tick - t0 }; });
  check('Esc opens the pause menu and pauses the game', m1.open && m1.visible === 'block' && m1.paused && m1.ticks === 0, m1);

  // ---------------------------------------------------------------- 3. switch everything with real mouse clicks
  for (const [k, v] of [['player', 'hd'], ['monster', 'hd'], ['env', 'hd'], ['camera', 'persp'], ['focal', '135']]) await clickSetting(page, k, v);
  await waitSettled(page);
  const s1 = await ev(page, () => ({ info: __game.settings.info(), active: [...document.querySelectorAll('#pause-menu button.on')].map((b) => b.dataset.setting + '=' + b.dataset.value), status: document.querySelector('#pause-menu .pm-status').textContent }));
  check('menu clicks enable HD player, HD monster, HD environment kit and weak perspective', s1.info.playerSkin === 'hd' && s1.info.envHd && s1.info.hd.monster && s1.info.camera === 'PerspectiveCamera' && !s1.info.hdError, s1);
  await shot(page, out, 'menu_open_hd.png');
  check('HD assets loaded with sensible budgets (tris)', s1.info.hd.player.tris > 15000 && s1.info.hd.player.tris < 80000 && s1.info.hd.monster.tris > 10000 && s1.info.hd.monster.tris < 60000 && s1.info.hd.envkit.parts >= 12, s1.info.hd);

  // ---------------------------------------------------------------- 4. weak perspective geometry: fixed yaw/pitch, long lens, same scale as iso
  const cam = await ev(page, () => {
    __game.reset({ waves: false, player: { x: 0, z: 2 } });
    const v = __game.view, c = v.camera;
    const dir = c.getWorldDirection(new c.position.constructor());
    const p = __game.sim.player.pos;
    const s0 = v.worldToScreen(p.x - 1, 0, p.z), s1 = v.worldToScreen(p.x + 1, 0, p.z);
    // far vs near: perspective => a 2 m segment 12 m up-screen is slightly smaller than one 12 m down-screen
    const a0 = v.worldToScreen(p.x - 6 - 1, 0, p.z - 6), a1 = v.worldToScreen(p.x - 6 + 1, 0, p.z - 6);
    const b0 = v.worldToScreen(p.x + 6 - 1, 0, p.z + 6), b1 = v.worldToScreen(p.x + 6 + 1, 0, p.z + 6);
    const iso = v.isoCamera; const idir = iso.getWorldDirection(new c.position.constructor());
    v.updateCamera(true);
    return { type: c.type, fov: c.fov, dist: c.position.distanceTo(v.camTarget), dir: dir.toArray(), isoDir: idir.toArray(), px2m: Math.hypot(s1.x - s0.x, s1.y - s0.y) / 2,
      far: Math.hypot(a1.x - a0.x, a1.y - a0.y), near: Math.hypot(b1.x - b0.x, b1.y - b0.y) };
  });
  const dot = cam.dir[0] * cam.isoDir[0] + cam.dir[1] * cam.isoDir[1] + cam.dir[2] * cam.isoDir[2];
  const ratio = cam.far / cam.near;
  check('weak perspective: perspective camera, iso yaw/pitch, long lens (135 mm ~ 10° FOV) far away', cam.type === 'PerspectiveCamera' && dot > 0.99999 && Math.abs(cam.fov - 10.16) < 0.1 && cam.dist > 60, { fov: +cam.fov.toFixed(2), dist: +cam.dist.toFixed(1), dirDot: dot });
  check('weak perspective: mild depth cue (far/near size ratio 0.75..0.98), not orthographic', ratio > 0.75 && ratio < 0.98, { far: +cam.far.toFixed(1), near: +cam.near.toFixed(1), ratio: +ratio.toFixed(3) });
  await clickSetting(page, 'camera', 'iso');
  const isoPx = await ev(page, () => { const v = __game.view, p = __game.sim.player.pos; const s0 = v.worldToScreen(p.x - 1, 0, p.z), s1 = v.worldToScreen(p.x + 1, 0, p.z); return Math.hypot(s1.x - s0.x, s1.y - s0.y) / 2; });
  check('weak perspective keeps the iso on-screen scale at the player (±3%)', Math.abs(cam.px2m / isoPx - 1) < 0.03, { persp: +cam.px2m.toFixed(2), iso: +isoPx.toFixed(2) });
  await clickSetting(page, 'camera', 'persp');
  await clickSetting(page, 'focal', '200');
  const f200 = await ev(page, () => __game.view.camera.fov);
  check('lens choice changes the focal length (200 mm ~ 6.9°)', Math.abs(f200 - 6.87) < 0.1, { fov: f200 });
  await clickSetting(page, 'focal', '135');

  // ---------------------------------------------------------------- 5. Esc resumes; camera never rotates while playing
  await page.keyboard.press('Escape');
  const r1 = await ev(page, () => ({ open: __game.settings.menu(), paused: __game.loop.paused }));
  check('Esc closes the menu and resumes', !r1.open && !r1.paused, r1);
  const q0 = await ev(page, () => __game.view.camera.quaternion.toArray());
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyW'); await sleep(700); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
  await page.mouse.move(200, 150); await sleep(150); await page.mouse.move(1000, 600); await sleep(150);
  const q1 = await ev(page, () => __game.view.camera.quaternion.toArray());
  const qd = Math.max(...q0.map((v, i) => Math.abs(v - q1[i])));
  check('weak perspective: fixed azimuth/angle — no camera rotation while moving and aiming', qd < 1e-9, { maxQuatDelta: qd });

  // ---------------------------------------------------------------- 6. core gameplay with HD + weak perspective (real input)
  await checkMovement(page, log, 'HD+persp');
  await checkEightTargets(page, log, 'HD+persp');
  await checkVisibility(page, log, 'HD+persp');

  // ---------------------------------------------------------------- 7. HD visuals never change gameplay
  const hashHd = await ev(page, () => runScripted());
  check('gameplay identical with classic and HD+perspective visuals (sim hash)', hashHd.hash === hashClassic.hash && hashHd.kills === hashClassic.kills, { classic: hashClassic, hd: hashHd });

  // ---------------------------------------------------------------- 8. HD actors are animated by the same rig
  const anim = await ev(page, async () => {
    const runAnim = () => {
      __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } });
      __game.debug.spawn(4, -2, { hp: 1000 });
      __game.aimAt(4, -2); __game.move(1, 0); __game.fire(true);
      const states = new Set(), mstates = new Set(); const grips = [];
      for (let i = 0; i < 150; i++) { __game.step(1); const a = __game.anim(); states.add(a.player.state); grips.push(a.player.gripError); for (const m of a.monsters) mstates.add(m.state); }
      __game.move(0, 0); __game.fire(false); __game.step(1);
      const feet = [];
      for (let i = 0; i < 20; i++) { __game.move(1, 0); __game.step(3); const f = __game.view.player.rig.j.footL.getWorldPosition(new __game.view.camera.position.constructor()); feet.push(f.x); }
      __game.move(0, 0); __game.step(1);
      return { states: [...states], mstates: [...mstates], grips, feet };
    };
    const hd = runAnim();
    const skin = __game.view.player.rig.skin, mskin = [...__game.view.monsters.values()].map((v) => v.rig.skin);
    const hdOnFoot = __game.view.player.rig.j.footL.children.some((c) => c.userData.hd || c.children.some((d) => d.userData.hd));
    const prev = __game.settings.get();
    await __game.settings.set({ player: 'classic', monster: 'classic' });
    const cl = runAnim();
    await __game.settings.set(prev);
    const gripDiff = Math.max(...hd.grips.map((g, i) => Math.abs(g - cl.grips[i])));
    const footDiff = Math.max(...hd.feet.map((f, i) => Math.abs(f - cl.feet[i])));
    return { states: hd.states, mstates: hd.mstates, skin, mskin, hdOnFoot, gripMedian: hd.grips.slice().sort((a, b) => a - b)[75], gripDiff, footDiff, footSpread: Math.max(...hd.feet) - Math.min(...hd.feet) };
  });
  check('HD player/monster are driven by the same procedural rig (identical IK/grip as classic, states, hands on gun)', anim.skin === 'hd' && anim.mskin.every((s) => s === 'hd') && anim.states.includes('move+shoot') && anim.gripDiff < 1e-6 && anim.footDiff < 1e-6 && anim.gripMedian < 0.02 && anim.footSpread > 0.3 && anim.hdOnFoot && anim.mstates.includes('hit'), anim);

  // ---------------------------------------------------------------- 9. hidden monster: 0 pixels with the HD environment
  const hid = await ev(page, () => {
    __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: -6 } });
    const id = __game.debug.spawn(0, -12.5, { dummy: true }); __game.aimAt(0, -14); __game.step(2);
    const cov = __game.coverage()[id]; const vis = __game.sim.monsters.find((m) => m.id === id).vis;
    return { vis: vis.visible, reason: vis.reason, occluder: vis.occluder, full: cov.full };
  });
  check('HD env: monster behind cover is not visible and renders 0 pixels', !hid.vis && hid.full === 0, hid);

  // ---------------------------------------------------------------- 10. runtime equipment / palette change on the HD player
  const eq = await ev(page, () => {
    __game.debug.respec('player', { equipment: { backpack: 'pack' }, palette: { accent: '#1d6fb8' } });
    const parts = []; __game.view.player.rig.root.traverse((o) => { if (o.isMesh && o.userData.hd) parts.push(o.name || o.parent.name); });
    const accent = [...new Set(__game.view.player.rig.root.children.length ? (() => { const m = []; __game.view.player.rig.root.traverse((o) => { if (o.isMesh && o.userData.hd) (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => { if (x.userData.slot === 'accent') m.push(x.color.getHexString()); }); }); return m; })() : [])];
    const r = { pack: parts.some((n) => n.includes('chest__pack')), reactor: parts.some((n) => n.includes('chest__reactor')), accent };
    __game.debug.respec('player', {});
    return r;
  });
  check('HD player: equipment variant (pack/reactor) and palette change at runtime', eq.pack && !eq.reactor && eq.accent.length === 1 && eq.accent[0] !== 'ffffff', eq);

  // ---------------------------------------------------------------- 11. persistence across reload, URL override
  await page.reload(); await page.waitForFunction(() => window.__game && window.__game.loop); await waitSettled(page);
  const p1 = await ev(page, () => __game.settings.info());
  check('settings persist across reload (HD + weak perspective restored)', p1.settings.player === 'hd' && p1.settings.env === 'hd' && p1.camera === 'PerspectiveCamera' && p1.playerSkin === 'hd' && p1.envHd, p1.settings);

  // ---------------------------------------------------------------- 12. evidence frames
  if (out) await evidence(page, out);
  // back to classic through the menu
  await page.keyboard.press('Escape');
  for (const [k, v] of [['player', 'classic'], ['monster', 'classic'], ['env', 'classic'], ['camera', 'iso']]) await clickSetting(page, k, v);
  await page.keyboard.press('Escape');
  const back = await ev(page, () => { __game.render(); const i = __game.settings.info(); return { ...i, classicVisible: __game.view.envClassic.every((g) => g.visible), ground: __game.view.scene.getObjectByName('ground').visible }; });
  check('switching back to classic restores classic visuals and ortho camera', back.playerSkin === 'classic' && !back.envHd && back.classicVisible && back.ground && back.camera === 'OrthographicCamera', { player: back.playerSkin, env: back.envHd, camera: back.camera });
  const errs = await ev(page, () => __game.errors());
  check('no runtime errors (stage 07)', errs.length === 0, { errs });
  await ev(page, () => { localStorage.removeItem('kepler.settings.v1'); });
}

/** Deterministic scripted fight (API input, paused stepping) -> sim hash; must not depend on visuals. */
function runScriptedSrc() {
  window.runScripted = () => {
    __game.pause(true); __game.reset({ seed: 5, waves: true, player: { x: 0, z: 2 } });
    for (let i = 0; i < 60 * 14; i++) {
      const s = __game.sim; const live = s.monsters.filter((m) => m.state !== 'dead' && m.vis.visible).sort((a, b) => a.vis.dist - b.vis.dist);
      // always an explicit world aim point: a mouse pixel maps to different world points under different projections
      if (live[0]) __game.aimAt(live[0].pos.x, live[0].pos.z); else __game.aimAt(s.player.pos.x + Math.cos(i / 40) * 5, s.player.pos.z + Math.sin(i / 40) * 5);
      __game.fire(!!live[0] && live[0].vis.dist < 10);
      __game.move(Math.sin(i / 50), Math.cos(i / 70));
      __game.step(1, i % 30 === 0);
    }
    __game.move(0, 0); __game.fire(false);
    return { hash: __game.debug.hash(), kills: __game.sim.stats.kills, tick: __game.sim.tick };
  };
}

async function evidence(page, out) {
  const setup = (cfg) => ev(page, async (c) => {
    await __game.settings.set(c.s);
    __game.pause(true); __game.reset({ seed: 3, waves: false, player: { x: 0.5, z: 1.5 } });
    __game.debug.spawn(3.5, -1.5, { hp: 1000 }); __game.debug.spawn(-3.2, -2.6, { hp: 1000 }); __game.debug.spawn(1.2, 5.2, { dummy: true });
    __game.debug.drone({ at: { x: -4, z: 4 }, freeze: true });
    __game.aimAt(3.5, -1.5); __game.fire(true);
    for (let i = 0; i < 40; i++) __game.step(1, i === 39);
    __game.fire(false);
    if (c.zoom) __game.debug.zoom(c.zoom); else __game.debug.zoom();
    __game.render();
  }, cfg);
  const frames = [
    ['compare_classic_iso.png', { s: { player: 'classic', monster: 'classic', env: 'classic', camera: 'iso' } }],
    ['compare_hd_iso.png', { s: { player: 'hd', monster: 'hd', env: 'hd', camera: 'iso' } }],
    ['compare_hd_persp135.png', { s: { player: 'hd', monster: 'hd', env: 'hd', camera: 'persp', focal: 135 } }],
    ['closeup_classic.png', { s: { player: 'classic', monster: 'classic', env: 'classic', camera: 'iso' }, zoom: 3.5 }],
    ['closeup_hd.png', { s: { player: 'hd', monster: 'hd', env: 'hd', camera: 'iso' }, zoom: 3.5 }],
    ['closeup_hd_persp.png', { s: { player: 'hd', monster: 'hd', env: 'hd', camera: 'persp', focal: 85 }, zoom: 3.5 }],
  ];
  for (const [name, cfg] of frames) { await setup(cfg); await sleep(200); await shot(page, out, name); }
  await ev(page, () => { __game.debug.zoom(); __game.debug.drone({ at: null, freeze: false }); });
  await ev(page, () => __game.settings.set({ player: 'hd', monster: 'hd', env: 'hd', camera: 'persp', focal: 135 }));
  for (const kind of ['player', 'monster']) {
    const url = await ev(page, (k) => __game.debug.turntable(k, undefined, { cell: 240 }), kind);
    fs.writeFileSync(path.join(out, `turntable_hd_${kind}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
}
