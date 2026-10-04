import { describe, expect, it } from 'vitest';
import { Sim, DT } from '../src/sim/sim';
import { CFG } from '../src/sim/config';
import { computeVisibility } from '../src/sim/visibility';

const deg = (d: number) => (d * Math.PI) / 180;

describe('visibility', () => {
  const sim = new Sim();
  const obs = sim.obstacles;
  const half = CFG.vision.sectorHalfAngleDeg;
  // open lane: from (0,2) looking -z towards (0,-8) is clear until cover_e at z=-10.05
  const px = 0, pz = 2, aim = -Math.PI / 2;
  const at = (angleDeg: number, dist: number) => {
    const a = aim + deg(angleDeg);
    return computeVisibility(obs, px, pz, aim, px + Math.cos(a) * dist, pz + Math.sin(a) * dist);
  };

  it('sector boundary is inclusive and exact', () => {
    expect(at(half, 4.5)).toMatchObject({ visible: true, reason: 'sector_clear' });
    expect(at(-half, 4.5)).toMatchObject({ visible: true, reason: 'sector_clear' });
    expect(at(half + 0.01, 4.5)).toMatchObject({ visible: false, reason: 'out_of_sector' });
    expect(at(-(half + 0.01), 4.5)).toMatchObject({ visible: false, reason: 'out_of_sector' });
    expect(at(half - 0.01, 4.5).visible).toBe(true);
  });

  it('near circle sees all around, regardless of facing', () => {
    for (let a = 0; a < 360; a += 45) expect(at(a, CFG.vision.nearRadius - 0.01)).toMatchObject({ visible: true, reason: 'near' });
    expect(at(180, CFG.vision.nearRadius + 0.01)).toMatchObject({ visible: false, reason: 'out_of_sector' });
  });

  it('cover occludes and is reported', () => {
    const r = computeVisibility(obs, 0, -6, aim, 0, -14); // cover_e sits between at z≈-10.5
    expect(r).toMatchObject({ visible: false, reason: 'occluded', occluder: 'cover_e' });
  });

  it('range limit', () => {
    expect(at(0, CFG.vision.range + 0.5).reason).not.toBe('sector_clear');
  });
});

describe('movement', () => {
  it('diagonals are normalised and W moves screen-up (-x,-z)', () => {
    const sim = new Sim(); sim.reset({ waves: false, player: { x: 0, z: 0 } });
    sim.input.moveY = 1; sim.step(30);
    const w = { ...sim.player.pos };
    expect(w.x).toBeLessThan(0); expect(w.z).toBeLessThan(0);
    expect(Math.abs(w.x - w.z)).toBeLessThan(1e-9);
    const straight = Math.hypot(w.x, w.z);
    sim.reset({ waves: false, player: { x: 0, z: 0 } });
    sim.input.moveY = 1; sim.input.moveX = 1; sim.step(30);
    const diag = Math.hypot(sim.player.pos.x, sim.player.pos.z);
    expect(Math.abs(diag - straight)).toBeLessThan(1e-6);
    expect(straight).toBeCloseTo(CFG.player.speed * 30 * DT, 6);
  });

  it('player collides with cover', () => {
    const sim = new Sim(); sim.reset({ waves: false, player: { x: 0, z: -8.5 } });
    // push "down screen-left" toward -z: use world steering via screen axes (W+D = -z)
    sim.input.moveY = 1; sim.input.moveX = 1; sim.step(120);
    expect(sim.player.pos.z).toBeGreaterThan(-10.05 + CFG.player.radius - 1e-6 - 0.001);
  });
});

describe('shooting', () => {
  it('hits 8 targets around the player and shot endpoint matches target', () => {
    const sim = new Sim(); sim.reset({ waves: false, player: { x: 0, z: 2 } });
    const ids: string[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      ids.push(sim.addMonster(Math.cos(a) * 2.5, 2 + Math.sin(a) * 2.5, { dummy: true, hp: 1000 }).id);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      sim.input.aimX = Math.cos(a) * 2.5; sim.input.aimZ = 2 + Math.sin(a) * 2.5;
      sim.input.firePressed = true; sim.step(10);
      const s = sim.shots[sim.shots.length - 1];
      expect(s.hitKind).toBe('monster'); expect(s.hitId).toBe(ids[k]);
      expect(Math.hypot(s.to.x - sim.input.aimX, s.to.z - sim.input.aimZ)).toBeCloseTo(CFG.monster.radius, 2);
    }
    expect(sim.monsters.every((m) => m.hp === 1000 - CFG.weapon.damage)).toBe(true);
  });

  it('shots are blocked by cover', () => {
    const sim = new Sim(); sim.reset({ waves: false, player: { x: 0, z: -6 } });
    const m = sim.addMonster(0, -14, { dummy: true });
    sim.input.aimX = 0; sim.input.aimZ = -14; sim.input.firePressed = true; sim.step(2);
    const s = sim.shots[0];
    expect(s.hitKind).toBe('obstacle'); expect(s.hitId).toBe('cover_e'); expect(s.material).toBe('metal');
    expect(m.hp).toBe(CFG.monster.hp);
  });
});

describe('waves', () => {
  it('a simple aim-bot clears all waves; monsters path around cover and attack', () => {
    const sim = new Sim(); sim.reset({ seed: 7 });
    let attacks = 0;
    const seenStates = new Set<string>();
    for (let t = 0; t < 60 * 240 && sim.phase !== 'victory' && sim.phase !== 'defeat'; t++) {
      // bot: shoot nearest live monster that is inside the arena; lets the closest one reach us first
      const live = sim.monsters.filter((m) => m.state !== 'dead' && Math.abs(m.pos.x) < 15 && Math.abs(m.pos.z) < 15);
      live.sort((a, b) => a.vis.dist - b.vis.dist);
      const tgt = live[0];
      sim.input.fire = !!tgt && tgt.vis.dist < (sim.wave === 1 ? 2.45 : 5);
      if (tgt) { sim.input.aimX = tgt.pos.x; sim.input.aimZ = tgt.pos.z; }
      sim.step(1);
      for (const m of sim.monsters) seenStates.add(m.state);
      attacks += sim.drainEvents().filter((e) => e.type === 'monster_attack').length;
    }
    expect(sim.phase).toBe('victory');
    expect(sim.wave).toBe(3);
    expect(sim.stats.kills).toBe(4 + 6 + 8);
    expect(attacks).toBeGreaterThan(0);
    for (const s of ['emerge', 'chase', 'windup', 'recover', 'dead']) expect(seenStates.has(s)).toBe(true);
  });

  it('determinism: same seed + inputs -> same hash', () => {
    const run = () => {
      const sim = new Sim(); sim.reset({ seed: 3 });
      for (let t = 0; t < 900; t++) { sim.input.moveX = Math.sin(t * 0.01); sim.input.fire = t % 20 < 5; sim.input.aimX = Math.cos(t * 0.02) * 5; sim.input.aimZ = Math.sin(t * 0.02) * 5; sim.step(1); }
      return sim.hash();
    };
    expect(run()).toBe(run());
  });
});
