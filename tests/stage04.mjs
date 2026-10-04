// Stage 04 checks: hit/damage/reaction/effect synchronisation, effects terminate, intense fire stays readable,
// visual effect settings never change combat results.
import fs from 'node:fs';
import path from 'node:path';

const ev = (page, fn, arg) => page.evaluate(fn, arg);

export async function run(page, { check }, out) {
  // ---------------------------------------------------------------- 1. synchronisation (real mouse click)
  const id = await ev(page, () => { __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.debug.fx(true, 1); const id = __game.debug.spawn(-3.5, -1, { dummy: true, hp: 1000 }); __game.step(2); return id; });
  const before = await ev(page, () => ({ ...__game.debug.fxStats().spawned }));
  const sc = await ev(page, () => __game.worldToScreen(-3.5, -1));
  await page.mouse.move(sc.x, sc.y); await page.mouse.down(); await page.mouse.up();
  const sync = await ev(page, (id) => {
    __game.step(1); // one sim tick + one render frame
    const ev = __game.events(); const shot = [...ev].reverse().find((e) => e.type === 'shot');
    const hit = [...ev].reverse().find((e) => e.type === 'monster_hit');
    const fx = __game.debug.fxStats(); const m = __game.sim.monsters.find((m) => m.id === id);
    const a = __game.anim().monsters.find((x) => x.id === id);
    return { shotTick: shot?.tick, hitTick: hit?.tick, hitShot: hit?.shot, shotId: shot?.shot.id, fxImpactTick: fx.lastImpactTick, fxImpactShot: fx.lastImpactShot, hp: m.hp, anim: a.state, reticleHit: document.getElementById('reticle').classList.contains('hit'), spawned: fx.spawned, tracerEnd: shot?.shot.to };
  }, id);
  const fleshDelta = (sync.spawned.impact_flesh ?? 0) - (before.impact_flesh ?? 0);
  check('hit, damage, body reaction, impact effect and hit-marker happen on the same tick/frame', sync.shotTick === sync.hitTick && sync.hitShot === sync.shotId && sync.fxImpactShot === sync.shotId && sync.fxImpactTick === sync.shotTick && sync.hp === 980 && sync.anim === 'hit' && fleshDelta === 1 && sync.reticleHit, sync);
  await ev(page, () => __game.debug.zoom(4.2));
  await ev(page, () => __game.debug.focus(-1.8, 0.5));
  await page.screenshot({ path: path.join(out, 'fx_flesh_hit.png') });
  await ev(page, () => { __game.debug.focus(); __game.debug.zoom(); });

  // ---------------------------------------------------------------- 2. effects terminate cleanly
  const base = await ev(page, () => { __game.reset({ waves: false, player: { x: -6, z: -1.5 } }); __game.step(1); return __game.view.fx.group.children.length; });
  await ev(page, () => { __game.aimAt(-6, -5); __game.fire(true); __game.step(60); __game.aimAt(-11, 1.5); __game.step(60); __game.fire(false); });
  const mid = await ev(page, () => __game.debug.fxStats());
  const after3 = await ev(page, () => { for (let i = 0; i < 18; i++) __game.step(10); return { ...__game.debug.fxStats(), children: __game.view.fx.group.children.length }; });
  const after12 = await ev(page, () => { for (let i = 0; i < 54; i++) __game.step(10); return { ...__game.debug.fxStats(), children: __game.view.fx.group.children.length }; });
  check('effects end: particles/lights/flashes gone after 3 s, decals faded after 12 s, no leaked objects', mid.active > 50 && after3.active === 0 && after3.lights === 0 && after12.timed === 0 && after12.children <= base + 1, { midActive: mid.active, after3: after3.active, lights: after3.lights, decalsAfter12: after12.timed, children: [base, after12.children] });

  // ---------------------------------------------------------------- 3. intense fire stays readable
  const intense = await ev(page, async () => {
    __game.reset({ waves: false, player: { x: 0, z: 2 } });
    const ids = [];
    for (let i = 0; i < 6; i++) { const a = -1.9 + i * 0.12; ids.push(__game.debug.spawn(Math.cos(a) * 5.5, 2 + Math.sin(a) * 5.5, { dummy: true, hp: 100000 })); }
    __game.fire(true);
    const samples = [];
    for (let k = 0; k < 6; k++) {
      const tgt = __game.sim.monsters[k % 6];
      __game.aimAt(tgt.pos.x, tgt.pos.z);
      const t0 = performance.now(); __game.step(20); const ms = performance.now() - t0;
      // frame brightness: fraction of near-white pixels
      const cv = __game.view.renderer.domElement;
      const c2 = document.createElement('canvas'); c2.width = 320; c2.height = 180; const g = c2.getContext('2d'); g.drawImage(cv, 0, 0, 320, 180);
      const d = g.getImageData(0, 0, 320, 180).data; let white = 0, lum = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++; lum += (d[i] + d[i + 1] + d[i + 2]) / 765; }
      const cov = __game.coverage();
      samples.push({ ms: +ms.toFixed(1), whiteFrac: +(white / (320 * 180)).toFixed(4), meanLum: +(lum / (320 * 180)).toFixed(3), visibleDrawn: Object.values(cov).filter((c) => c.visibleFlag && c.solo > 0).length, visible: Object.values(cov).filter((c) => c.visibleFlag).length, fx: __game.debug.fxStats().active });
    }
    __game.fire(false);
    return samples;
  });
  await ev(page, () => { __game.fire(true); __game.step(9); __game.fire(false); });
  await page.screenshot({ path: path.join(out, 'fx_intense_fire.png') });
  const maxWhite = Math.max(...intense.map((s) => s.whiteFrac)), maxMs = Math.max(...intense.map((s) => s.ms / 21));
  check('intense fire stays readable: <3% blown-out pixels, all visible monsters still drawn, bounded particle counts', maxWhite < 0.03 && intense.every((s) => s.meanLum > 0.05) && intense.every((s) => s.visibleDrawn === s.visible && s.visible >= 5) && intense.every((s) => s.fx < 6000), { samples: intense, msPerTickAndFrame: +maxMs.toFixed(2) });

  // ---------------------------------------------------------------- 4. visual settings never change combat
  const runCombat = (fxOn, intensity) => ev(page, ([fxOn, intensity]) => {
    __game.debug.fx(fxOn, intensity);
    __game.reset({ seed: 11, waves: true });
    for (let i = 0; i < 60 * 40; i++) {
      const s = __game.sim; const live = s.monsters.filter((m) => m.state !== 'dead' && m.vis.visible).sort((a, b) => a.vis.dist - b.vis.dist);
      if (live[0]) __game.aimAt(live[0].pos.x, live[0].pos.z);
      __game.fire(!!live[0] && live[0].vis.dist < 8);
      __game.move(Math.sin(i / 50), Math.cos(i / 70));
      __game.step(1, i % 3 === 0);
    }
    __game.fire(false); __game.move(0, 0);
    const s = __game.sim;
    return { hash: __game.debug.hash(), stats: s.stats, tick: s.tick, hp: s.player.hp, wave: s.wave, shots: s.shots.slice(-5).map((x) => [x.id, x.to.x, x.to.z, x.hitId, x.damage]) };
  }, [fxOn, intensity]);
  const a = await runCombat(true, 1), b = await runCombat(false, 1), c = await runCombat(true, 3);
  await ev(page, () => __game.debug.fx(true, 1));
  check('combat results identical with FX on / off / 3x intensity (hash, kills, shots, damage, last shot rays)', a.hash === b.hash && b.hash === c.hash && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c) && a.stats.kills > 3, { fxOn: a.hash, fxOff: b.hash, fx3x: c.hash, stats: a.stats });

  // ---------------------------------------------------------------- evidence
  await ev(page, () => {
    __game.reset({ waves: false, player: { x: -6.5, z: 1 } });
    __game.debug.spawn(-6.5, -3.5, { dummy: true, hp: 100000 });
    __game.aimAt(-11, 1); __game.fire(true); __game.step(30); __game.aimAt(-6.5, -3.5); __game.step(14);
    for (let i = 0; i < 10; i++) { __game.step(1); if (__game.sim.tick - __game.sim.player.lastShotTick === 1) break; }
    __game.fire(false);
  });
  await page.screenshot({ path: path.join(out, 'fx_stone_metal_flesh.png') });
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(await ev(page, () => ({ state: __game.state(), fx: __game.debug.fxStats() })), null, 1));
}
