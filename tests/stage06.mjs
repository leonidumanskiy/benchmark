// Stage 06 checks: everything from stage 05 (final visuals) + procedural audio driven by game events.
import fs from 'node:fs';
import path from 'node:path';
import { run as run05 } from './stage05.mjs';

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run(page, log, out) {
  await run05(page, log, out);
  const { check } = log;
  // real gesture (click on canvas) keeps/creates a running AudioContext
  await ev(page, () => { __game.pause(false); __game.reset({ waves: false, player: { x: 0, z: 2 } }); });
  await page.mouse.move(640, 200); await page.mouse.down(); await sleep(500); await page.mouse.up();
  const fire = await ev(page, async () => { await new Promise((r) => setTimeout(r, 150)); return { info: __game.audio.info(), peak: __game.audio.peak() }; });
  check('audio: real click -> running AudioContext, gunshots produce signal', fire.info.ctx === 'running' && fire.info.played.shot >= 2 && fire.peak > 0.05, { ctx: fire.info.ctx, shots: fire.info.played.shot, peak: fire.peak });
  await page.keyboard.down('KeyA'); await sleep(900); await page.keyboard.up('KeyA');
  check('audio: footsteps while walking (real WASD)', (await ev(page, () => __game.audio.info().played.step ?? 0)) >= 2);
  // combat: kill a monster in front of the player, impacts on cover, sounds counted 1:1 with sim events
  const combat = await ev(page, async () => {
    const g = __game; g.pause(true); g.reset({ waves: false, player: { x: 0, z: 2 } });
    const before = g.audio.info().played;
    const id = g.debug.spawn(0, -2, {}); g.aimAt(0, -2); g.fire(true);
    for (let i = 0; i < 90; i++) g.step(1);
    g.fire(false); g.step(1);
    const s = g.sim.obstacles.find((o) => o.material === 'stone').shape; g.aimAt(s.cx, s.cz); g.fire(true);
    for (let i = 0; i < 30; i++) g.step(1);
    g.fire(false); g.step(1);
    const after = g.audio.info().played;
    const d = (k) => (after[k] ?? 0) - (before[k] ?? 0);
    const evs = g.events();
    const n = (t) => evs.filter((e) => e.type === t).length;
    await new Promise((r) => setTimeout(r, 120));
    return { hit: d('monster_hit'), killed: d('monster_killed'), shot: d('shot'), stone: d('impact_stone'), simHit: n('monster_hit'), simKilled: n('monster_killed'), simShot: n('shot'), peak: g.audio.peak(), dead: g.sim.monsters.find((m) => m.id === id)?.state ?? 'removed' };
  });
  check('audio: hit/kill/shot sounds match sim events 1:1, stone impact plays', combat.hit === combat.simHit && combat.killed === combat.simKilled && combat.killed === 1 && combat.shot === combat.simShot && combat.stone >= 1 && combat.peak > 0.05, combat);
  // waves: alarm + spawn growls
  const waves = await ev(page, () => {
    const g = __game; g.reset({ waves: true }); const b = g.audio.info().played;
    for (let i = 0; i < 60 * 4; i++) g.step(1, i % 10 === 0);
    g.step(1); const a = g.audio.info().played;
    return { wave_start: (a.wave_start ?? 0) - (b.wave_start ?? 0), spawn: (a.monster_spawn ?? 0) - (b.monster_spawn ?? 0) };
  });
  check('audio: wave alarm + monster spawn growls', waves.wave_start >= 1 && waves.spawn >= 1, waves);
  // determinism: audio never changes gameplay (same hash with sound muted)
  const det = await ev(page, () => {
    const g = __game; const runOnce = () => { g.reset({ seed: 3, waves: true }); for (let i = 0; i < 600; i++) { g.aimAt(Math.sin(i / 40) * 6, Math.cos(i / 40) * 6); g.fire(i % 3 === 0); g.step(1, false); } g.fire(false); return g.debug.hash(); };
    g.audio.mute(false); const a = runOnce(); g.audio.mute(true); const b = runOnce(); g.audio.mute(false); return { a, b };
  });
  check('audio: gameplay hash identical muted vs unmuted', det.a === det.b, det);
  // M key mutes / unmutes
  await page.keyboard.press('KeyM'); const m1 = await ev(page, () => __game.audio.info().muted);
  await page.keyboard.press('KeyM'); const m2 = await ev(page, () => __game.audio.info().muted);
  check('audio: real M key toggles mute', m1 === true && m2 === false, { m1, m2 });
  fs.writeFileSync(path.join(out, 'audio.json'), JSON.stringify(await ev(page, () => __game.audio.info()), null, 1));
  await ev(page, () => { __game.reset({ waves: false }); __game.pause(false); });
}
