// Deterministic fixed-step game simulation. No DOM / three.js dependencies: runs identically in node tests and browser.
import { CFG } from './config';
import { buildArena, Decor, Obstacle, SpawnPoint } from './arena';
import { NavGrid } from './nav';
import { Rng } from './rng';
import { pushOut, rayCircle, rayShape, round3, V2, wrapAngle } from './math';
import { computeVisibility, VisResult } from './visibility';

export const DT = 1 / CFG.tickRate;
/** Screen axes projected onto the ground for the fixed isometric camera (camera sits at +x,+y,+z looking at origin). */
export const ISO_RIGHT: V2 = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
export const ISO_UP: V2 = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };

export interface Input {
  /** screen-space move axes: moveX right(+)/left(-), moveY up(+)/down(-) */
  moveX: number; moveY: number;
  aimX: number; aimZ: number;
  fire: boolean;
  /** edge-triggered fire request (a click), consumed when a shot is fired */
  firePressed: boolean;
}

export type MonsterState = 'emerge' | 'chase' | 'windup' | 'recover' | 'dead' | 'dummy';

export interface Monster {
  id: string;
  pos: V2;
  facing: number;
  hp: number;
  maxHp: number;
  state: MonsterState;
  stateT: number;
  hurtT: number;
  path: V2[];
  repathT: number;
  spawn: string | null;
  vis: VisResult;
  /** for animation: current velocity */
  vel: V2;
  lastHitDir: V2;
  deadT: number;
}

export interface Shot {
  id: number; tick: number;
  from: V2; to: V2; angle: number;
  hitKind: 'monster' | 'obstacle' | 'none';
  hitId: string | null;
  material: 'flesh' | 'metal' | 'stone' | 'none';
  damage: number; killed: boolean;
}

export type GameEvent =
  | { type: 'shot'; tick: number; shot: Shot }
  | { type: 'monster_hit'; tick: number; id: string; hp: number; shot: number }
  | { type: 'monster_killed'; tick: number; id: string }
  | { type: 'monster_spawn'; tick: number; id: string; spawn: string }
  | { type: 'monster_attack'; tick: number; id: string; hit: boolean }
  | { type: 'player_hit'; tick: number; by: string; hp: number }
  | { type: 'wave_start'; tick: number; wave: number }
  | { type: 'wave_clear'; tick: number; wave: number }
  | { type: 'victory'; tick: number }
  | { type: 'defeat'; tick: number };

export type Phase = 'pre' | 'wave' | 'intermission' | 'victory' | 'defeat' | 'sandbox';

export interface ResetOptions { seed?: number; waves?: boolean; player?: V2 }

export class Sim {
  readonly obstacles: Obstacle[];
  readonly spawns: SpawnPoint[];
  readonly decor: Decor[];
  readonly nav: NavGrid;

  tick = 0;
  seed = 1;
  rng = new Rng(1);
  phase: Phase = 'pre';
  phaseT = 0;
  wave = 0; // 1-based index of current/last wave
  toSpawn = 0;
  spawnT = 0;
  spawnCursor = 0;
  monsterSeq = 0;
  shotSeq = 0;

  player = {
    pos: { x: 0, z: 0 } as V2, vel: { x: 0, z: 0 } as V2, hp: CFG.player.hp, alive: true,
    aimAngle: 0, aim: { x: 0, z: 0 } as V2, cooldown: 0, shots: 0, lastShotTick: -999, hurtT: 0,
  };
  monsters: Monster[] = [];
  shots: Shot[] = [];
  events: GameEvent[] = []; // drained by renderer
  log: GameEvent[] = []; // ring buffer for API
  stats = { kills: 0, shots: 0, hits: 0, damageTaken: 0, attacks: 0 };

  input: Input = { moveX: 0, moveY: 0, aimX: 0, aimZ: -5, fire: false, firePressed: false };

  constructor() {
    const a = buildArena();
    this.obstacles = a.obstacles; this.spawns = a.spawns; this.decor = a.decor;
    this.nav = new NavGrid(this.obstacles, CFG.monster.radius + 0.05);
    this.reset();
  }

  reset(opts: ResetOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.rng = new Rng(this.seed);
    this.tick = 0;
    this.phase = opts.waves === false ? 'sandbox' : 'pre';
    this.phaseT = 0; this.wave = 0; this.toSpawn = 0; this.spawnT = 0; this.spawnCursor = 0;
    this.monsterSeq = 0; this.shotSeq = 0;
    const p = opts.player ?? CFG.player.start;
    Object.assign(this.player, {
      pos: { x: p.x, z: p.z }, vel: { x: 0, z: 0 }, hp: CFG.player.hp, alive: true,
      aimAngle: -Math.PI / 2, aim: { x: p.x, z: p.z - 5 }, cooldown: 0, shots: 0, lastShotTick: -999, hurtT: 0,
    });
    this.monsters = []; this.shots = []; this.events = []; this.log = [];
    this.stats = { kills: 0, shots: 0, hits: 0, damageTaken: 0, attacks: 0 };
    this.input = { moveX: 0, moveY: 0, aimX: p.x, aimZ: p.z - 5, fire: false, firePressed: false };
    this.updateVisibility();
  }

  private emit(e: GameEvent) {
    this.events.push(e);
    this.log.push(e);
    if (this.log.length > 120) this.log.shift();
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
  }

  addMonster(x: number, z: number, opts: { dummy?: boolean; hp?: number; spawn?: string | null } = {}): Monster {
    const m: Monster = {
      id: `m${++this.monsterSeq}`, pos: { x, z }, facing: Math.atan2(this.player.pos.z - z, this.player.pos.x - x),
      hp: opts.hp ?? CFG.monster.hp, maxHp: opts.hp ?? CFG.monster.hp,
      state: opts.dummy ? 'dummy' : 'emerge', stateT: 0, hurtT: 0, path: [], repathT: 0, spawn: opts.spawn ?? null,
      vis: { visible: false, reason: 'out_of_sector', occluder: null, dist: 0, angleDeg: 0 },
      vel: { x: 0, z: 0 }, lastHitDir: { x: 0, z: 0 }, deadT: 0,
    };
    this.monsters.push(m);
    this.updateVisibility();
    return m;
  }

  step(n = 1) { for (let i = 0; i < n; i++) this.stepOnce(); }

  private stepOnce() {
    this.tick++;
    this.updatePlayer();
    this.updateWaves();
    this.updateMonsters();
    this.updateVisibility();
  }

  // ---------------------------------------------------------------- player
  private updatePlayer() {
    const P = this.player, I = this.input;
    P.cooldown = Math.max(0, P.cooldown - DT);
    P.hurtT = Math.max(0, P.hurtT - DT);
    if (!P.alive) { P.vel.x = P.vel.z = 0; I.firePressed = false; return; }

    // movement in screen space -> world, diagonals normalised
    let mx = I.moveX, my = I.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const wx = ISO_RIGHT.x * mx + ISO_UP.x * my;
    const wz = ISO_RIGHT.z * mx + ISO_UP.z * my;
    P.vel.x = wx * CFG.player.speed; P.vel.z = wz * CFG.player.speed;
    P.pos.x += P.vel.x * DT; P.pos.z += P.vel.z * DT;
    this.collide(P.pos, CFG.player.radius);
    const lim = CFG.navHalf - 0.6;
    P.pos.x = Math.max(-lim, Math.min(lim, P.pos.x));
    P.pos.z = Math.max(-lim, Math.min(lim, P.pos.z));

    // aim
    const ax = I.aimX - P.pos.x, az = I.aimZ - P.pos.z;
    if (Math.hypot(ax, az) > 0.25) P.aimAngle = Math.atan2(az, ax);
    P.aim.x = I.aimX; P.aim.z = I.aimZ;

    // fire
    if ((I.fire || I.firePressed) && P.cooldown <= 0 && this.phase !== 'victory') {
      I.firePressed = false;
      P.cooldown = CFG.weapon.fireInterval;
      this.fire();
    }
  }

  private collide(p: V2, r: number) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const ob of this.obstacles) moved = pushOut(p, r, ob.shape) || moved;
      if (!moved) break;
    }
  }

  /** Hitscan shot along aim direction. The returned segment is exactly what the renderer draws. */
  private fire(): Shot {
    const P = this.player;
    const ux = Math.cos(P.aimAngle), uz = Math.sin(P.aimAngle);
    const ox = P.pos.x, oz = P.pos.z;
    let bestT = CFG.weapon.range;
    let hitKind: Shot['hitKind'] = 'none', hitId: string | null = null, material: Shot['material'] = 'none';
    for (const ob of this.obstacles) {
      const t = rayShape(ox, oz, ux, uz, ob.shape);
      if (t >= 0 && t < bestT) { bestT = t; hitKind = 'obstacle'; hitId = ob.id; material = ob.material; }
    }
    let target: Monster | null = null;
    for (const m of this.monsters) {
      if (m.state === 'dead') continue;
      const t = rayCircle(ox, oz, ux, uz, m.pos.x, m.pos.z, CFG.monster.radius);
      if (t >= 0 && t < bestT) { bestT = t; hitKind = 'monster'; hitId = m.id; material = 'flesh'; target = m; }
    }
    const shot: Shot = {
      id: ++this.shotSeq, tick: this.tick, from: { x: round3(ox), z: round3(oz) },
      to: { x: round3(ox + ux * bestT), z: round3(oz + uz * bestT) }, angle: round3(P.aimAngle),
      hitKind, hitId, material, damage: target ? CFG.weapon.damage : 0, killed: false,
    };
    P.shots++; P.lastShotTick = this.tick; this.stats.shots++;
    this.emit({ type: 'shot', tick: this.tick, shot });
    if (target) {
      this.stats.hits++;
      target.hp = Math.max(0, target.hp - CFG.weapon.damage);
      target.hurtT = CFG.monster.hurtTime;
      target.lastHitDir = { x: ux, z: uz };
      if (target.state !== 'dummy' || target.hp > 0) {
        target.pos.x += ux * CFG.monster.knockback; target.pos.z += uz * CFG.monster.knockback;
        if (target.state !== 'dummy') this.collide(target.pos, CFG.monster.radius);
      }
      this.emit({ type: 'monster_hit', tick: this.tick, id: target.id, hp: target.hp, shot: shot.id });
      if (target.hp <= 0) {
        target.state = 'dead'; target.stateT = 0; target.deadT = 0; shot.killed = true; this.stats.kills++;
        this.emit({ type: 'monster_killed', tick: this.tick, id: target.id });
      }
    }
    this.shots.push(shot);
    if (this.shots.length > 32) this.shots.shift();
    return shot;
  }

  // ---------------------------------------------------------------- waves
  private aliveWaveMonsters() { return this.monsters.filter((m) => m.state !== 'dead' && m.state !== 'dummy').length; }

  private updateWaves() {
    this.phaseT += DT;
    const waves = CFG.waves;
    switch (this.phase) {
      case 'pre':
        if (this.phaseT >= CFG.firstWaveDelay) this.startWave(1);
        break;
      case 'intermission':
        if (this.phaseT >= CFG.intermission) this.startWave(this.wave + 1);
        break;
      case 'wave': {
        const w = waves[this.wave - 1];
        this.spawnT -= DT;
        if (this.toSpawn > 0 && this.spawnT <= 0) {
          // pick next spawn point that is not occupied
          for (let k = 0; k < this.spawns.length; k++) {
            const sp = this.spawns[(this.spawnCursor + k) % this.spawns.length];
            const busy = this.monsters.some((m) => m.state !== 'dead' && Math.hypot(m.pos.x - sp.x, m.pos.z - sp.z) < 1.3);
            if (busy) continue;
            this.spawnCursor = (this.spawnCursor + k + 1 + Math.floor(this.rng.next() * 3)) % this.spawns.length;
            const m = this.addMonster(sp.x, sp.z, { spawn: sp.id });
            this.toSpawn--; this.spawnT = w.interval;
            this.emit({ type: 'monster_spawn', tick: this.tick, id: m.id, spawn: sp.id });
            break;
          }
        }
        if (this.toSpawn === 0 && this.aliveWaveMonsters() === 0) {
          this.emit({ type: 'wave_clear', tick: this.tick, wave: this.wave });
          if (this.wave >= waves.length) { this.phase = 'victory'; this.emit({ type: 'victory', tick: this.tick }); }
          else this.phase = 'intermission';
          this.phaseT = 0;
        }
        break;
      }
    }
  }

  private startWave(n: number) {
    this.wave = n; this.phase = 'wave'; this.phaseT = 0;
    this.toSpawn = CFG.waves[n - 1].count; this.spawnT = 0;
    this.emit({ type: 'wave_start', tick: this.tick, wave: n });
  }

  // ---------------------------------------------------------------- monsters
  private updateMonsters() {
    const M = CFG.monster, P = this.player;
    for (const m of this.monsters) {
      m.stateT += DT;
      m.hurtT = Math.max(0, m.hurtT - DT);
      m.vel.x = m.vel.z = 0;
      if (m.state === 'dead') { m.deadT += DT; continue; }
      if (m.state === 'dummy') continue;
      const dx = P.pos.x - m.pos.x, dz = P.pos.z - m.pos.z;
      const dist = Math.hypot(dx, dz);
      const edge = dist - M.radius - CFG.player.radius;
      const toPlayer = Math.atan2(dz, dx);
      switch (m.state) {
        case 'emerge':
          if (m.stateT >= M.emergeTime) this.setState(m, 'chase');
          break;
        case 'chase': {
          if (!P.alive) break;
          if (edge <= M.attackRange) { this.setState(m, 'windup'); break; }
          let tx = P.pos.x, tz = P.pos.z;
          if (!this.nav.segmentClear(m.pos.x, m.pos.z, tx, tz)) {
            m.repathT -= DT;
            if (m.repathT <= 0 || m.path.length === 0) {
              m.path = this.nav.findPath(m.pos, P.pos);
              m.repathT = M.repathInterval + this.rng.next() * 0.1;
            }
            while (m.path.length && Math.hypot(m.path[0].x - m.pos.x, m.path[0].z - m.pos.z) < 0.35) m.path.shift();
            if (m.path.length) { tx = m.path[0].x; tz = m.path[0].z; }
          } else m.path = [];
          const mx = tx - m.pos.x, mz = tz - m.pos.z, ml = Math.hypot(mx, mz);
          if (ml > 1e-4) {
            const sp = M.speed * (m.hurtT > 0 ? M.hurtSpeedMul : 1);
            m.vel.x = (mx / ml) * sp; m.vel.z = (mz / ml) * sp;
            m.pos.x += m.vel.x * DT; m.pos.z += m.vel.z * DT;
            m.facing = turnTowards(m.facing, Math.atan2(mz, mx), 10 * DT);
          }
          break;
        }
        case 'windup':
          m.facing = turnTowards(m.facing, toPlayer, 8 * DT);
          if (m.stateT >= M.windup) {
            const hit = P.alive && edge <= M.attackRange + 0.45;
            if (hit) {
              P.hp = Math.max(0, P.hp - M.damage); P.hurtT = 0.25; this.stats.damageTaken += M.damage;
              this.emit({ type: 'player_hit', tick: this.tick, by: m.id, hp: P.hp });
              if (P.hp <= 0 && P.alive) { P.alive = false; this.phase = 'defeat'; this.phaseT = 0; this.emit({ type: 'defeat', tick: this.tick }); }
            }
            this.stats.attacks++;
            this.emit({ type: 'monster_attack', tick: this.tick, id: m.id, hit });
            this.setState(m, 'recover');
          }
          break;
        case 'recover':
          if (m.stateT >= M.recover) this.setState(m, 'chase');
          break;
      }
    }
    // separation between living monsters and from the player, then obstacle collision
    const live = this.monsters.filter((m) => m.state !== 'dead');
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = M.radius * 2;
        if (d < min && d > 1e-6) {
          const push = (min - d) / 2, nx = dx / d, nz = dz / d;
          if (a.state !== 'dummy') { a.pos.x -= nx * push; a.pos.z -= nz * push; }
          if (b.state !== 'dummy') { b.pos.x += nx * push; b.pos.z += nz * push; }
        }
      }
      if (a.state !== 'dummy') {
        pushOut(a.pos, M.radius + CFG.player.radius, { kind: 'circle', cx: P.pos.x, cz: P.pos.z, r: 0 });
        this.collide(a.pos, M.radius);
      }
    }
    // remove old corpses
    this.monsters = this.monsters.filter((m) => !(m.state === 'dead' && m.deadT > M.corpseTime));
  }

  private setState(m: Monster, s: MonsterState) { m.state = s; m.stateT = 0; }

  // ---------------------------------------------------------------- visibility
  updateVisibility() {
    const P = this.player;
    for (const m of this.monsters) m.vis = computeVisibility(this.obstacles, P.pos.x, P.pos.z, P.aimAngle, m.pos.x, m.pos.z);
  }

  drainEvents(): GameEvent[] { const e = this.events; this.events = []; return e; }

  /** Compact machine-readable snapshot. */
  snapshot() {
    const P = this.player;
    return {
      tick: this.tick, time: round3(this.tick * DT), seed: this.seed, phase: this.phase, wave: this.wave, waves: CFG.waves.length,
      toSpawn: this.toSpawn,
      player: {
        x: round3(P.pos.x), z: round3(P.pos.z), vx: round3(P.vel.x), vz: round3(P.vel.z), hp: P.hp, alive: P.alive,
        aimDeg: round3((P.aimAngle * 180) / Math.PI), aimX: round3(P.aim.x), aimZ: round3(P.aim.z), shots: P.shots,
      },
      monsters: this.monsters.map((m) => ({
        id: m.id, x: round3(m.pos.x), z: round3(m.pos.z), hp: m.hp, state: m.state, hurt: m.hurtT > 0,
        visible: m.vis.visible, reason: m.vis.reason, occluder: m.vis.occluder,
        dist: round3(m.vis.dist), angleDeg: round3(m.vis.angleDeg),
      })),
      lastShot: this.shots[this.shots.length - 1] ?? null,
      stats: { ...this.stats },
    };
  }

  /** Stable hash of gameplay state (used to prove visuals don't affect combat). */
  hash(): string {
    let h = 2166136261 >>> 0;
    const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619) >>> 0; };
    mix(this.tick); mix(this.player.pos.x); mix(this.player.pos.z); mix(this.player.hp); mix(this.player.shots);
    for (const m of this.monsters) { mix(m.pos.x); mix(m.pos.z); mix(m.hp); mix(m.state.length); }
    for (const s of this.shots) { mix(s.to.x); mix(s.to.z); mix(s.damage); }
    return h.toString(16);
  }
}

function turnTowards(cur: number, target: number, maxStep: number) {
  const d = wrapAngle(target - cur);
  return Math.abs(d) <= maxStep ? target : wrapAngle(cur + Math.sign(d) * maxStep);
}
