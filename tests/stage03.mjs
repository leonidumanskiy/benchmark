// Stage 03 checks: play animation states + transitions in runtime (real keys), grab selected frames into sheets,
// then change the shared model/equipment spec and verify animations still work.
import fs from 'node:fs';
import path from 'node:path';

const ev = (page, fn, arg) => page.evaluate(fn, arg);

async function sheetInit(page) {
  await ev(page, () => {
    const c = document.createElement('canvas'); c.width = 6 * 230; c.height = 4 * 250;
    const g = c.getContext('2d'); g.fillStyle = '#0c0f12'; g.fillRect(0, 0, c.width, c.height);
    window.__sheet = { c, g, n: 0 };
  });
}
/** copy a region of the WebGL canvas around world (x,z) into the next sheet slot */
async function grab(page, label, who = 'player') {
  return ev(page, ([label, who]) => {
    const s = window.__sheet, cv = __game.view.renderer.domElement;
    let x, z;
    if (who === 'player') ({ x, z } = __game.sim.player.pos); else { const m = __game.sim.monsters.find((m) => m.id === who); x = m.pos.x; z = m.pos.z; }
    __game.debug.focus(x, z);
    const p = __game.view.worldToScreen(x, 0.8, z);
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const col = s.n % 6, row = Math.floor(s.n / 6);
    s.g.drawImage(cv, (p.x - r.left) * k - 115 * k, (p.y - r.top) * k - 120 * k, 230 * k, 230 * k, col * 230, row * 250, 230, 230);
    s.g.fillStyle = '#9fd3ff'; s.g.font = '13px Consolas, monospace'; s.g.fillText(label, col * 230 + 6, row * 250 + 244);
    s.n++;
    __game.debug.focus();
    return true;
  }, [label, who]);
}
async function sheetSave(page, file) {
  const url = await ev(page, () => window.__sheet.c.toDataURL('image/png'));
  fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}
const anim = (page) => ev(page, () => __game.anim());

async function playerSequence(page, log, tag, frames) {
  const { check } = log;
  await ev(page, () => __game.debug.zoom(3.4));
  const seq = [];
  const rec = async () => { const a = (await anim(page)).player; if (seq[seq.length - 1] !== a.state) seq.push(a.state); return a; };
  await ev(page, () => { __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.aimAt(6, 2); for (let i = 0; i < 15; i++) __game.step(10); });
  let a = await rec(); if (frames) await grab(page, 'idle (low-ready)');
  const idleOk = a.state === 'idle' && a.aim < 0.2;
  await ev(page, () => { __game.aimAt(6, 3); __game.step(12); });
  a = await rec(); if (frames) await grab(page, 'aim');
  const aimOk = a.state === 'aim' && a.aim > 0.6;
  await ev(page, () => { __game.fire('click'); __game.step(2); });
  a = await rec(); if (frames) await grab(page, 'shoot (recoil)');
  const shootOk = a.state === 'shoot' && a.recoil > 0.3;
  await ev(page, () => __game.step(20));
  // 8 movement directions with REAL keys, aim fixed to world +x
  const combos = [['KeyD'], ['KeyW', 'KeyD'], ['KeyW'], ['KeyW', 'KeyA'], ['KeyA'], ['KeyS', 'KeyA'], ['KeyS'], ['KeyS', 'KeyD']];
  const dirs = new Set(); let maxGrip = 0;
  for (const keys of combos) {
    await ev(page, () => { __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.aimAt(6, 2); __game.step(5); });
    for (const k of keys) await page.keyboard.down(k);
    await ev(page, () => __game.step(17));
    a = await rec(); dirs.add(a.dir); maxGrip = Math.max(maxGrip, a.gripError);
    if (frames) await grab(page, `move ${keys.map((k) => k[3]).join('+')} → ${a.dir}`);
    for (const k of keys) await page.keyboard.up(k);
    await ev(page, () => __game.step(2));
  }
  // move + shoot
  await page.keyboard.down('KeyW');
  await ev(page, () => { __game.fire(true); __game.step(16); });
  a = await rec(); if (frames) await grab(page, 'move + shoot');
  const msOk = a.state === 'move+shoot';
  await page.keyboard.up('KeyW');
  await ev(page, () => { __game.fire(false); for (let i = 0; i < 14; i++) __game.step(10); });
  a = await rec();
  const backIdle = a.state === 'idle';
  check(`player anim states idle/aim/shoot/move/move+shoot + return to idle${tag}`, idleOk && aimOk && shootOk && msOk && backIdle, { seq });
  check(`player walks in 8 directions relative to aim, hands stay on the gun${tag}`, dirs.size === 8 && maxGrip < 0.03, { dirs: [...dirs], maxGripError: maxGrip });
}

async function monsterSequence(page, log, tag, frames) {
  const { check } = log;
  await ev(page, () => __game.debug.zoom(4.4));
  const seq = [];
  const id = await ev(page, () => { __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } }); const id = __game.debug.spawn(-5.5, 0, {}); __game.aimAt(-5.5, 0); __game.step(14); return id; });
  const st = async () => { const r = await ev(page, (id) => { const a = __game.anim().monsters.find((m) => m.id === id); const m = __game.sim.monsters.find((m) => m.id === id); return { a, s: m && { state: m.state, t: m.stateT, vis: m.vis.visible } }; }, id); if (r.a && seq[seq.length - 1] !== r.a.state) seq.push(r.a.state); return r; };
  let r = await st(); if (frames) await grab(page, 'emerge', id);
  // walk: step until chasing with a step in progress
  for (let i = 0; i < 60; i++) { await ev(page, () => __game.step(1)); r = await st(); if (r.a.state === 'walk' && r.a.stepping > 0 && r.s.t > 0.25) break; }
  if (frames) await grab(page, 'walk (stepping)', id);
  await ev(page, () => __game.step(3)); r = await st(); if (frames) await grab(page, 'walk', id);
  // attack windup / strike
  for (let i = 0; i < 200; i++) { await ev(page, () => __game.step(1)); r = await st(); if (r.s.state === 'windup' && r.s.t > 0.3) break; }
  if (frames) await grab(page, 'attack windup', id);
  for (let i = 0; i < 40; i++) { await ev(page, () => __game.step(1)); r = await st(); if (r.s.state === 'recover' && r.s.t > 0.05) break; }
  if (frames) await grab(page, 'attack strike', id);
  // hit reaction (real mouse click on the monster)
  await ev(page, () => __game.step(10));
  const sc = await ev(page, (id) => { const m = __game.sim.monsters.find((m) => m.id === id); return __game.worldToScreen(m.pos.x, m.pos.z); }, id);
  await page.mouse.move(sc.x, sc.y); await page.mouse.down(); await page.mouse.up();
  await ev(page, () => __game.step(3)); r = await st();
  const hitOk = r.a.state === 'hit' && r.a.hit > 0.3;
  if (frames) await grab(page, 'hit reaction', id);
  // death
  for (let i = 0; i < 6 && r.s.state !== 'dead'; i++) { await page.mouse.down(); await page.mouse.up(); await ev(page, () => __game.step(8)); r = await st(); }
  await ev(page, () => __game.step(12)); r = await st(); if (frames) await grab(page, 'death (collapse)', id);
  await ev(page, () => __game.step(40)); r = await st(); if (frames) await grab(page, 'dead', id);
  // idle: a stationary dummy
  const d = await ev(page, () => { __game.reset({ waves: false, player: { x: 0, z: 2 } }); const d = __game.debug.spawn(-2.5, 1, { dummy: true }); __game.step(30); return d; });
  const idle = await ev(page, (d) => __game.anim().monsters.find((m) => m.id === d).state, d);
  if (frames) await grab(page, 'idle', d);
  const need = ['emerge', 'walk', 'attack-windup', 'attack-strike', 'hit', 'dead'];
  check(`monster anim states + transitions emerge→walk→windup→strike→hit→dead, idle${tag}`, need.every((s) => seq.includes(s)) && hitOk && idle === 'idle', { seq, idle });
}

export async function run(page, log, out) {
  await ev(page, () => __game.debug.zoom(3.4));
  await sheetInit(page);
  await playerSequence(page, log, '', true);
  await sheetSave(page, path.join(out, 'anim_player.png'));
  await sheetInit(page);
  await monsterSequence(page, log, '', true);
  await sheetSave(page, path.join(out, 'anim_monster.png'));
  // ---- small change of the shared model/equipment, then replay
  const specs = await ev(page, () => ({ p: __game.debug.respec('player', { equipment: { pauldron: 'light', backpack: 'pack', antenna: false } }), m: __game.debug.respec('monster', { dorsalSpikes: 7, scale: 1.0, palette: { spike: '#e0601a' } }) }));
  await sheetInit(page);
  await playerSequence(page, log, ' [after spec change]', true);
  await monsterSequence(page, log, ' [after spec change]', true);
  await sheetSave(page, path.join(out, 'anim_after_spec_change.png'));
  log.check('spec change applied (player: light pauldrons, pack, no antenna; monster: 7 spike pairs, scale 1.0, orange spikes), no errors', (await ev(page, () => __game.errors())).length === 0, { player: specs.p.equipment, monster: { dorsalSpikes: specs.m.dorsalSpikes, scale: specs.m.scale } });
  await ev(page, () => { __game.debug.respec('player', {}); __game.debug.respec('monster', {}); __game.debug.zoom(); });
  // ---- one normal-scale gameplay frame with fighting
  await ev(page, () => {
    __game.reset({ seed: 4, waves: true }); __game.pause(true);
    for (let i = 0; i < 60 * 10; i++) {
      const s = __game.sim; const live = s.monsters.filter((m) => m.state !== 'dead' && m.vis.visible).sort((a, b) => a.vis.dist - b.vis.dist);
      if (live[0]) __game.aimAt(live[0].pos.x, live[0].pos.z);
      __game.fire(!!live[0] && live[0].vis.dist < 7); __game.move(i % 240 < 120 ? 1 : -1, 0);
      __game.step(1, false);
    }
    __game.step(1); __game.fire(false); __game.move(0, 0);
  });
  await page.screenshot({ path: path.join(out, 'gameplay.png') });
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(await ev(page, () => ({ state: __game.state(), anim: __game.anim() })), null, 1));
}
