// Stage-01 gameplay checks, reused by every later stage. Uses REAL browser keyboard/mouse events for control.
export function makeLog() {
  const results = [];
  const check = (name, ok, data = {}) => { results.push({ name, ok: !!ok, ...data }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${Object.keys(data).length ? '  ' + JSON.stringify(data) : ''}`); return ok; };
  /** recorded as neither pass nor fail (ok: null) — used when the environment cannot run a check meaningfully */
  const skip = (name, reason) => { results.push({ name, ok: null, skipped: reason }); console.log(`SKIP  ${name}  (${reason})`); };
  return { results, check, skip };
}

const g = (page, fn, arg) => page.evaluate(fn, arg);

/** Hold real keys for n sim ticks (paused, deterministic stepping). */
async function holdKeys(page, keys, ticks) {
  for (const k of keys) await page.keyboard.down(k);
  await g(page, (n) => __game.step(n), ticks);
  for (const k of keys) await page.keyboard.up(k);
  await g(page, () => __game.step(1));
}

export async function checkMovement(page, { check }, tag = '') {
  const t = tag ? ` [${tag}]` : '';
  await g(page, () => { __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } }); });
  const scr = () => g(page, () => { const p = __game.sim.player.pos; return __game.view.worldToScreen(p.x, 0, p.z); });
  const pos = () => g(page, () => ({ ...__game.sim.player.pos }));
  const dirs = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
  const mags = {};
  for (const [k, [ex, ey]] of Object.entries(dirs)) {
    await g(page, () => __game.reset({ waves: false, player: { x: 0, z: 2 } }));
    const s0 = await scr(), p0 = await pos();
    await holdKeys(page, [k], 30);
    const s1 = await scr(), p1 = await pos();
    const dx = s1.x - s0.x, dy = s1.y - s0.y, L = Math.hypot(dx, dy);
    mags[k] = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check(`move ${k} goes screen ${ex ? (ex > 0 ? 'right' : 'left') : ey > 0 ? 'down' : 'up'}${t}`, L > 10 && (dx / L) * ex + (dy / L) * ey > 0.99, { screenDx: Math.round(dx), screenDy: Math.round(dy), world: +mags[k].toFixed(3) });
  }
  await g(page, () => __game.reset({ waves: false, player: { x: 0, z: 2 } }));
  const p0 = await pos();
  await holdKeys(page, ['KeyW', 'KeyD'], 30);
  const p1 = await pos();
  const diag = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check(`diagonal W+D normalised${t}`, Math.abs(diag - mags.KeyW) < 1e-3, { diag: +diag.toFixed(4), straight: +mags.KeyW.toFixed(4) });
  // collision: walk up-screen into cover_e from below (cover at z=-10.5, player at x=0,z=-8 -> W+D = world -z)
  await g(page, () => __game.reset({ waves: false, player: { x: 0, z: -8 } }));
  await holdKeys(page, ['KeyW', 'KeyD'], 90);
  const pc = await pos();
  check(`collision with cover (no penetration)${t}`, pc.z >= -10.05 + 0.45 - 0.01, { z: +pc.z.toFixed(3), coverFace: -10.05 });
}

/** Aim with the real mouse at 8 dummies around the player and click. */
export async function checkEightTargets(page, { check }, tag = '', radius = 2.6) {
  const t = tag ? ` [${tag}]` : '';
  const ids = await g(page, (r) => {
    __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } });
    const ids = [];
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; ids.push(__game.debug.spawn(Math.cos(a) * r, 2 + Math.sin(a) * r, { dummy: true, hp: 1000 })); }
    __game.step(1); return ids;
  }, radius);
  let hits = 0; const rows = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, tx = Math.cos(a) * radius, tz = 2 + Math.sin(a) * radius;
    const s = await g(page, ([x, z]) => __game.worldToScreen(x, z), [tx, tz]);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down(); await page.mouse.up();
    const r = await g(page, (id) => {
      __game.step(8); // > weapon cooldown (6.6 ticks)
      const st = __game.state(); const shot = st.lastShot; const m = st.monsters.find((m) => m.id === id);
      return { shot, hp: m.hp, visible: m.visible, fxImpactShot: __game.scene().fx?.lastImpactShot };
    }, ids[k]);
    const ok = r.shot && r.shot.hitId === ids[k] && r.hp === 1000 - 20;
    // the drawn tracer endpoint equals the combat ray's hit point; check it lies on the target's surface
    const endErr = r.shot ? Math.abs(Math.hypot(r.shot.to.x - tx, r.shot.to.z - tz) - 0.55) : 99;
    if (ok && endErr < 0.02) hits++;
    rows.push({ k, hit: r.shot?.hitId, hp: r.hp, endErr: +endErr.toFixed(4), vis: r.visible, fxImpactShot: r.fxImpactShot });
  }
  check(`8 targets around player hit via real mouse${t}`, hits === 8, { hits, rows });
}

export async function checkVisibility(page, { check }, tag = '') {
  const t = tag ? ` [${tag}]` : '';
  const r = await g(page, () => {
    __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: -6 } });
    const C = __game.cfg.vision;
    const behind = __game.debug.spawn(0, -14, { dummy: true }); // behind cover_e
    const inSector = __game.debug.spawn(-1.2, -9.5, { dummy: true }); // ~15° off aim, clear LOS
    const outSector = __game.debug.spawn(6, -4, { dummy: true }); // right, ~90° off aim
    const nearBack = __game.debug.spawn(0, -6 + 2.5, { dummy: true }); // behind the player but inside near circle
    __game.aimAt(-0.5, -14); __game.step(2);
    const vis = Object.fromEntries(__game.visibility().map((v) => [v.id, v]));
    const cov = __game.coverage();
    // sector boundary: place targets exactly on / just outside the edge
    const P = __game.sim.player; const a0 = P.aimAngle, half = (C.sectorHalfAngleDeg * Math.PI) / 180, d = 3.6;
    const edgeIn = __game.visibility({ x: P.pos.x + Math.cos(a0 + half) * d, z: P.pos.z + Math.sin(a0 + half) * d });
    const edgeOut = __game.visibility({ x: P.pos.x + Math.cos(a0 + half + 0.002) * d, z: P.pos.z + Math.sin(a0 + half + 0.002) * d });
    return { ids: { behind, inSector, outSector, nearBack }, vis, cov, edgeIn, edgeOut };
  });
  const { ids, vis, cov } = r;
  check(`hidden behind cover, occluder reported${t}`, !vis[ids.behind].visible && vis[ids.behind].reason === 'occluded' && vis[ids.behind].occluder === 'cover_e', { v: vis[ids.behind] });
  check(`visible in sector with clear LOS${t}`, vis[ids.inSector].visible && vis[ids.inSector].reason === 'sector_clear');
  check(`hidden outside sector${t}`, !vis[ids.outSector].visible && vis[ids.outSector].reason === 'out_of_sector');
  check(`near circle sees behind the player${t}`, vis[ids.nearBack].visible && vis[ids.nearBack].reason === 'near');
  check(`sector boundary inclusive (edge visible, +0.11° hidden)${t}`, r.edgeIn.visible && !r.edgeOut.visible && r.edgeOut.reason === 'out_of_sector', { edgeIn: r.edgeIn.angleDeg, edgeOut: r.edgeOut.angleDeg });
  // visibility == what is actually drawn (ID render pass pixel counts)
  const mismatch = Object.entries(cov).filter(([id, c]) => (c.visibleFlag ? c.solo === 0 : c.full !== 0));
  const renderedFlags = Object.values(vis).every((v) => v.rendered === v.visible);
  check(`rendered pixels match gameplay visibility${t}`, mismatch.length === 0 && renderedFlags, { cov });
}

/** Run full waves with an in-page bot (internal API aim/fire) and verify the wave loop end to end. */
export async function checkWaves(page, { check }, tag = '') {
  const t = tag ? ` [${tag}]` : '';
  const r = await g(page, () => {
    __game.pause(true); __game.reset({ seed: 5, waves: true });
    const seenSpawnHidden = new Set(), enteredArena = new Set(), phases = [];
    const pathedAround = new Set();
    let lastPhase = '';
    for (let i = 0; i < 60 * 300; i++) {
      const s = __game.sim;
      if (s.phase !== lastPhase) { phases.push(`${s.phase}:${s.wave}@${s.tick}`); lastPhase = s.phase; }
      if (s.phase === 'victory' || s.phase === 'defeat') break;
      const live = s.monsters.filter((m) => m.state !== 'dead' && Math.abs(m.pos.x) < 15.5 && Math.abs(m.pos.z) < 15.5).sort((a, b) => a.vis.dist - b.vis.dist);
      const tgt = live[0];
      if (tgt) __game.aimAt(tgt.pos.x, tgt.pos.z);
      __game.fire(!!tgt && tgt.vis.dist < (s.wave === 1 ? 2.45 : 6));
      __game.step(1, i % 4 === 0);
      for (const m of s.monsters) {
        if (m.state === 'emerge' && !m.vis.visible) seenSpawnHidden.add(m.id);
        if (Math.abs(m.pos.x) < 15 && Math.abs(m.pos.z) < 15) enteredArena.add(m.id);
        if (m.state === 'chase' && m.path.length > 1) pathedAround.add(m.id);
      }
    }
        __game.fire(false);
    const s = __game.sim;
    return { phase: s.phase, wave: s.wave, kills: s.stats.kills, hp: s.player.hp, phases, spawnHidden: seenSpawnHidden.size, entered: enteredArena.size, pathed: pathedAround.size, attackers: s.stats.attacks, dmg: s.stats.damageTaken };
  });
  check(`waves 1→2→3 complete in order, victory${t}`, r.phase === 'victory' && r.wave === 3 && r.kills === 18 && r.phases.join(',').includes('wave:1') && r.phases.join(',').includes('wave:3'), r);
  check(`monsters spawn hidden behind cover and enter arena${t}`, r.spawnHidden >= 15 && r.entered === 18, { spawnHidden: r.spawnHidden, entered: r.entered });
  check(`monsters path around obstacles and attack${t}`, r.pathed > 5 && r.attackers > 0 && r.dmg > 0, { pathed: r.pathed, attackers: r.attackers, dmg: r.dmg });
}

/** Real-time (unpaused) control check: keys + mouse while the loop runs. */
/** Software WebGL (SwiftShader, no GPU) renders this scene at ~0.5 fps: wall-clock real-time checks are meaningless there. */
export const SOFTWARE_GL = () => process.env.E2E_SOFTWARE_GL === '1';
export const SW_REASON = 'software WebGL (SwiftShader): ~0.5 fps, wall-clock real-time loop cannot be exercised; deterministic stepped checks still run';

export async function checkRealtime(page, { check, skip }, tag = '') {
  const t = tag ? ` [${tag}]` : '';
  if (SOFTWARE_GL()) { skip(`real-time keys + held mouse fire${t}`, SW_REASON); return; }
  await g(page, () => { __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.pause(false); });
  const p0 = await g(page, () => ({ ...__game.sim.player.pos }));
  await page.keyboard.down('KeyA'); await page.waitForTimeout(400); await page.keyboard.up('KeyA');
  await page.waitForTimeout(100);
  const p1 = await g(page, () => ({ ...__game.sim.player.pos }));
  // A = screen left = world (-x,+z)
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  const target = await g(page, () => { const p = __game.sim.player.pos; const id = __game.debug.spawn(p.x - 2, p.z - 2, { dummy: true, hp: 1000 }); return { id, s: __game.worldToScreen(p.x - 2, p.z - 2) }; });
  await page.mouse.move(target.s.x, target.s.y);
  await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.up();
  await page.waitForTimeout(100);
  const r = await g(page, (id) => { const m = __game.sim.monsters.find((m) => m.id === id); return { hp: m.hp, shots: __game.sim.player.shots }; }, target.id);
  check(`real-time keys + held mouse fire${t}`, dx < -0.5 && dz > 0.5 && r.shots >= 3 && r.hp <= 1000 - 60, { dx: +dx.toFixed(2), dz: +dz.toFixed(2), ...r });
  await g(page, () => __game.pause(true));
}

export async function runCore(page, log, tag = '') {
  await checkMovement(page, log, tag);
  await checkEightTargets(page, log, tag);
  await checkVisibility(page, log, tag);
  await checkRealtime(page, log, tag);
}
