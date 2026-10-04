// Actor views: bind rigs to sim entities and animate them procedurally. Render-only: never writes sim state.
import * as THREE from 'three';
import { buildPlayer, PlayerRig, PLAYER_SPEC, PlayerSpec } from '../assets/player';
import { buildMonster, MonsterRig, MONSTER_SPEC, MonsterSpec } from '../assets/monster';
import { contactShadow } from '../assets/environment';
import { Monster, Sim, DT } from '../sim/sim';
import { CFG } from '../sim/config';
import { wrapAngle } from '../sim/math';

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const DIR8 = ['fwd', 'fwd-left', 'left', 'back-left', 'back', 'back-right', 'right', 'fwd-right'];

// =====================================================================================================  player
export class PlayerView {
  rig: PlayerRig;
  shadow = contactShadow(0.6);
  t = 0;
  phase = 0; // gait phase
  walkW = 0; // 0 idle .. 1 full walk
  aimW = 1; // 0 low-ready .. 1 aiming
  lastAimAngle = 0; aimActiveT = 0;
  deathT = 0;
  moveLocal = new THREE.Vector2(); // x: left(+)/right(-), y: fwd(+)/back(-)
  recoil = 0;
  anim = { state: 'idle', dir: '', walk: 0, aim: 1, recoil: 0, gripError: 0 };
  private lastShot = -999;

  constructor(spec: PlayerSpec = PLAYER_SPEC) { this.rig = buildPlayer(spec); this.rig.root.add(this.shadow); }

  update(sim: Sim, dt: number) {
    const P = sim.player, R = this.rig, j = R.j;
    this.t += dt;
    const r = R.root;
    r.position.set(P.pos.x, 0, P.pos.z);
    r.rotation.set(0, -P.aimAngle, 0);

    // ---- locomotion in model space (model forward = +Z, left = +X)
    const a = P.aimAngle;
    const lx = P.vel.x * Math.sin(a) - P.vel.z * Math.cos(a);
    const lz = P.vel.x * Math.cos(a) + P.vel.z * Math.sin(a);
    const speed = Math.hypot(lx, lz);
    if (speed > 0.1) this.moveLocal.set(lx / speed, lz / speed);
    this.walkW = damp(this.walkW, P.alive ? clamp01(speed / CFG.player.speed) : 0, 12, dt);
    const cycle = 1.7; // metres per gait cycle
    this.phase += (dt * Math.max(speed, 0) * Math.PI * 2) / cycle;
    const w = this.walkW;

    // ---- aim readiness: raise to aim on fire or aim change, lower after a calm period
    const aimDelta = Math.abs(wrapAngle(a - this.lastAimAngle));
    this.lastAimAngle = a;
    if (aimDelta > 0.01) this.aimActiveT = 0; else this.aimActiveT += dt;
    if (P.lastShotTick !== this.lastShot) { this.lastShot = P.lastShotTick; this.aimActiveT = 0; }
    const sinceShot = (sim.tick - P.lastShotTick) * DT;
    this.recoil = clamp01(1 - sinceShot / 0.1); // driven by sim time since the shot -> deterministic
    this.aimW = damp(this.aimW, sinceShot < 1.6 || this.aimActiveT < 1.2 ? 1 : 0, 6, dt);
    const k = this.recoil * this.recoil;

    // ---- body
    const bob = w * (0.035 * Math.abs(Math.sin(this.phase)) - 0.03);
    const breathe = Math.sin(this.t * 1.7) * (1 - w);
    j.hips.position.set(0, R.dims.hipY + bob + breathe * 0.006, 0);
    j.hips.rotation.set(0, w * 0.18 * this.moveLocal.x * Math.sign(this.moveLocal.y || 1) * 0.5, w * 0.05 * Math.sin(this.phase));
    j.spine.rotation.set(w * 0.12 * this.moveLocal.y + breathe * 0.02, -j.hips.rotation.y, -j.hips.rotation.z * 0.8 - w * 0.08 * this.moveLocal.x);
    j.chest.rotation.set(-0.04 * k + breathe * 0.015, R.dims.stanceYaw, 0);
    j.head.rotation.set(0.05 * (1 - this.aimW) - 0.06 * k, 0, 0);

    // ---- weapon: low-ready <-> aim, sway, recoil; arms follow by IK
    const aw = this.aimW;
    const sway = (1 - aw) * Math.sin(this.t * 1.3) * 0.02 + w * Math.sin(this.phase * 2) * 0.012;
    R.gun.position.set(-0.1 + 0.03 * (1 - aw), 0.24 - 0.05 * (1 - aw) + sway, 0.2 - 0.03 * (1 - aw) - 0.07 * k);
    R.gun.rotation.set(0.38 * (1 - aw) - 0.16 * k, 0.15 * (1 - aw), 0.1 * (1 - aw));

    // ---- hurt flinch
    const hurt = clamp01(P.hurtT / 0.25);
    j.chest.rotation.x -= 0.25 * hurt; j.head.rotation.z = 0.2 * hurt;

    // ---- death
    if (!P.alive) this.deathT += dt; else this.deathT = 0;
    const d = ease(clamp01(this.deathT / 0.7));
    R.model.rotation.set(-1.45 * d, Math.PI / 2, 0);
    R.model.position.y = 0.12 * d;

    // ---- feet (procedural stride in movement direction, IK)
    const A = 0.3 * w;
    const mv = this.moveLocal;
    const footFor = (side: number, ph: number) => {
      const s = Math.sin(ph), c = Math.cos(ph);
      const lift = Math.max(0, c) * 0.16 * w;
      return new THREE.Vector3(0.13 * side + mv.x * A * s, 0.09 + lift, 0.0 + mv.y * A * s - (1 - w) * 0.02 * side);
    };
    const fL = footFor(1, this.phase), fR = footFor(-1, this.phase + Math.PI);
    if (w < 0.05) { fL.set(0.15, 0.09, 0.04); fR.set(-0.14, 0.09, -0.06); }
    R.solveLegs(fL, fR);
    R.solveArms();

    // ---- readout
    const gL = R.gripL.getWorldPosition(new THREE.Vector3()), hL = j.handL.getWorldPosition(new THREE.Vector3());
    const gR = R.gripR.getWorldPosition(new THREE.Vector3()), hR = j.handR.getWorldPosition(new THREE.Vector3());
    const sector = Math.round(((Math.atan2(mv.x, mv.y) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    this.anim = {
      state: !P.alive ? 'dead' : k > 0.15 ? (w > 0.3 ? 'move+shoot' : 'shoot') : w > 0.3 ? 'move' : aw > 0.5 ? 'aim' : 'idle',
      dir: w > 0.3 ? DIR8[sector] : '', walk: +w.toFixed(2), aim: +aw.toFixed(2), recoil: +k.toFixed(2),
      gripError: +Math.max(gL.distanceTo(hL), gR.distanceTo(hR)).toFixed(3),
    };
  }
}

// =====================================================================================================  monster
interface FootState { world: THREE.Vector3; from: THREE.Vector3; t: number; stepping: boolean }

export class MonsterView {
  rig: MonsterRig;
  shadow = contactShadow(1.1);
  hpBar: THREE.Mesh;
  private flashMats: THREE.MeshStandardMaterial[];
  private feet: FootState[] = [];
  private gaitT = 0;
  private t = Math.random() * 10; // visual-only randomness
  private lastFacing = 0;
  anim = { state: 'idle', stepping: 0, hit: 0 };
  private glowBase: number[];

  constructor(public id: string, spec: MonsterSpec = MONSTER_SPEC) {
    this.rig = buildMonster(spec);
    this.rig.root.userData.monster = id;
    this.rig.root.add(this.shadow);
    this.shadow.userData.ui = true;
    this.hpBar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.07), new THREE.MeshBasicMaterial({ color: 0xff4a3a, depthTest: false, transparent: true, opacity: 0.85 }));
    this.hpBar.renderOrder = 10; this.hpBar.userData.ui = true;
    this.rig.root.add(this.hpBar);
    this.flashMats = [this.rig.mats.shell, this.rig.mats.shellDark, this.rig.mats.flesh] as THREE.MeshStandardMaterial[];
    for (const m of this.flashMats) m.userData.baseEmissive = m.emissive.clone();
    this.glowBase = [this.rig.mats.glow.emissiveIntensity, this.rig.mats.eye.emissiveIntensity];
  }

  private worldRest(i: number, lead: THREE.Vector3) {
    return this.rig.model.localToWorld(this.rig.legs[i].rest.clone().add(lead));
  }

  update(m: Monster, sim: Sim, cam: THREE.Camera, dt: number) {
    const R = this.rig, j = R.j, M = CFG.monster;
    this.t += dt;
    const root = R.root;
    root.position.set(m.pos.x, 0, m.pos.z);
    root.rotation.set(0, -m.facing, 0);
    if (m.state === 'emerge') root.position.y = -1.3 * (1 - ease(clamp01(m.stateT / M.emergeTime)));
    if (m.state === 'dead') root.position.y = -Math.max(0, m.deadT - 1.7) * 0.7;
    root.updateMatrixWorld(true);

    // velocity in model space (+Z fwd, +X left)
    const a = m.facing;
    const lx = m.vel.x * Math.sin(a) - m.vel.z * Math.cos(a);
    const lz = m.vel.x * Math.cos(a) + m.vel.z * Math.sin(a);
    const speed = Math.hypot(m.vel.x, m.vel.z);
    const turn = wrapAngle(a - this.lastFacing) / Math.max(dt, 1e-3); this.lastFacing = a;
    this.gaitT += dt * (1 + speed);

    // ---- body pose by state
    let bodyPitch = -0.16, bodyY = R.bodyRestY, bodyZ = 0, bodyRoll = 0, headPitch = 0.22, jaw = 0.1 + 0.08 * Math.sin(this.t * 7) * Math.sin(this.t * 1.3);
    let armT: THREE.Vector3[] | undefined;
    const breathe = Math.sin(this.t * 2.2);
    bodyY += breathe * 0.02 + Math.sin(this.gaitT * 6) * 0.035 * Math.min(1, speed / M.speed);
    bodyPitch += -0.08 * Math.min(1, speed / M.speed); // lean into run
    bodyRoll += -turn * 0.05;
    let state = speed > 0.3 ? 'walk' : 'idle';
    if (m.state === 'emerge') state = 'emerge';
    if (m.state === 'windup') {
      const p = ease(clamp01(m.stateT / M.windup));
      bodyPitch -= 0.5 * p; bodyZ -= 0.18 * p; bodyY += 0.12 * p; jaw = 0.1 + 0.55 * p;
      armT = [new THREE.Vector3(0.55, 1.7 + 0.1 * p, 0.6 - 0.2 * p), new THREE.Vector3(-0.55, 1.7 + 0.1 * p, 0.6 - 0.2 * p)];
      state = 'attack-windup';
    } else if (m.state === 'recover' && m.stateT < 0.22) {
      const p = ease(clamp01(m.stateT / 0.1));
      bodyPitch += 0.3 * p; bodyZ += 0.25 * p; jaw = 0.6 - 0.4 * p;
      armT = [new THREE.Vector3(0.28, 0.25, 1.9), new THREE.Vector3(-0.28, 0.25, 1.9)];
      state = 'attack-strike';
    } else if (m.state === 'recover') state = 'attack-recover';

    // ---- hit reaction: body jerks away from the shot, head snaps back, jaws gape
    const hit = clamp01(m.hurtT / M.hurtTime);
    if (hit > 0 && m.state !== 'dead') {
      const hx = m.lastHitDir.x * Math.sin(a) - m.lastHitDir.z * Math.cos(a);
      const hz = m.lastHitDir.x * Math.cos(a) + m.lastHitDir.z * Math.sin(a);
      const e = Math.sin(hit * Math.PI * 0.5);
      bodyZ += hz * 0.22 * e; bodyRoll += -hx * 0.45 * e; bodyPitch += -hz * 0.35 * e; bodyY += 0.05 * e;
      headPitch -= 0.6 * e; jaw = 0.75 * e + jaw * (1 - e);
      state = 'hit';
    }

    // ---- death: collapse, legs curl, glow fades
    let curl = 0;
    if (m.state === 'dead') {
      const d = ease(clamp01(m.deadT / 0.6));
      curl = d;
      bodyY = R.bodyRestY * (1 - 0.62 * d); bodyRoll += 0.55 * d; bodyPitch = -0.16 + 0.3 * d; headPitch = 0.22 + 0.6 * d; jaw = 0.6 * d;
      const f = 1 - clamp01(m.deadT / 1.2);
      R.mats.glow.emissiveIntensity = this.glowBase[0] * f; R.mats.eye.emissiveIntensity = this.glowBase[1] * f;
      (R.mats.flesh as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 * f;
      state = 'dead';
    } else { R.mats.glow.emissiveIntensity = this.glowBase[0] * (1 + 0.35 * hit * hit); R.mats.eye.emissiveIntensity = this.glowBase[1]; }

    j.body.position.set(0, bodyY, bodyZ);
    j.body.rotation.set(bodyPitch, 0, bodyRoll);
    j.head.rotation.set(headPitch, 0, 0);
    // head tracks the player a little
    const toP = Math.atan2(sim.player.pos.z - m.pos.z, sim.player.pos.x - m.pos.x);
    j.neck.rotation.y = -Math.max(-0.5, Math.min(0.5, wrapAngle(toP - a))) * (m.state === 'dead' ? 0 : 1);
    j.jawL.rotation.y = jaw; j.jawR.rotation.y = -jaw;
    j.abdomen.rotation.x = 0.35 + breathe * 0.04; j.tail.rotation.x = Math.sin(this.t * 1.5) * 0.1;
    root.updateMatrixWorld(true);

    // ---- legs: world-planted feet, alternating tetrapod stepping toward a velocity-led target
    const lead = new THREE.Vector3(lx, 0, lz).multiplyScalar(0.16 / R.spec.scale);
    if (this.feet.length === 0) this.feet = R.legs.map((_, i) => { const w = this.worldRest(i, new THREE.Vector3()); return { world: w.clone(), from: w.clone(), t: 0, stepping: false }; });
    const groups = [[0, 3], [1, 2]];
    const stepDur = speed > 0.5 ? 0.17 : 0.24;
    const thresh = speed > 0.5 ? 0.42 : 0.18;
    const targets: THREE.Vector3[] = [];
    if (m.state === 'dead' || m.state === 'emerge') {
      R.legs.forEach((L, i) => {
        const rest = L.rest.clone();
        const curled = new THREE.Vector3(rest.x * 0.35, 0.45, rest.z * 0.4);
        const flail = m.state === 'emerge' ? new THREE.Vector3(0, 0.25 + 0.2 * Math.sin(this.t * 18 + i * 1.7), 0.15 * Math.cos(this.t * 15 + i)) : new THREE.Vector3();
        targets.push(rest.lerp(curled, curl).add(flail));
        this.feet[i].world.copy(R.model.localToWorld(targets[i].clone())); this.feet[i].stepping = false;
      });
    } else {
      const anyStepping = (g: number[]) => g.some((i) => this.feet[i].stepping);
      for (let gi = 0; gi < 2; gi++) {
        const g = groups[gi], other = groups[1 - gi];
        if (anyStepping(g) || anyStepping(other)) continue;
        const err = Math.max(...g.map((i) => this.feet[i].world.distanceTo(this.worldRest(i, lead))));
        const errOther = Math.max(...other.map((i) => this.feet[i].world.distanceTo(this.worldRest(i, lead))));
        if (err > thresh && err >= errOther) { for (const i of g) { this.feet[i].stepping = true; this.feet[i].t = 0; this.feet[i].from.copy(this.feet[i].world); } break; }
      }
      R.legs.forEach((_, i) => {
        const f = this.feet[i];
        if (f.stepping) {
          f.t += dt / stepDur;
          const dst = this.worldRest(i, lead);
          const tt = ease(clamp01(f.t));
          f.world.lerpVectors(f.from, dst, tt);
          f.world.y = Math.sin(Math.PI * clamp01(f.t)) * 0.28;
          if (f.t >= 1) { f.stepping = false; f.world.y = 0; }
        }
        targets.push(R.model.worldToLocal(f.world.clone()));
      });
    }
    R.solveLegs(targets);
    // scythes: idle sway, attack poses
    if (!armT) {
      const sw = Math.sin(this.t * 2.4) * 0.05;
      armT = R.arms.map((A) => A.rest.clone().add(new THREE.Vector3(0, sw, sw * 0.5)));
      if (m.state === 'dead') armT = R.arms.map((A) => A.rest.clone().lerp(new THREE.Vector3(A.rest.x * 0.6, 0.2, 0.9), curl));
    }
    R.solveArms(armT);

    // ---- flash, visibility, hp bar
    const f = m.hurtT > 0 ? m.hurtT / M.hurtTime : 0;
    for (const mat of this.flashMats) mat.emissive.copy(mat.userData.baseEmissive).lerp(new THREE.Color(1, 0.18, 0.06), f * f * 0.06);
    // wounds flare: flesh + glowing organs brighten briefly (keeps the carapace shading/silhouette intact)
    (R.mats.flesh as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + 0.9 * f * f;
    root.visible = m.vis.visible;
    this.hpBar.visible = m.state !== 'dead' && m.state !== 'dummy' && m.hp < m.maxHp;
    this.hpBar.scale.x = Math.max(0.01, m.hp / m.maxHp);
    this.hpBar.position.set(0, 2.0, 0);
    this.hpBar.quaternion.copy(root.quaternion).invert().multiply(cam.quaternion);
    this.anim = { state, stepping: this.feet.filter((x) => x.stepping).length, hit: +hit.toFixed(2) };
  }

  dispose() {
    this.rig.root.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.geometry.dispose(); } });
    Object.values(this.rig.mats).forEach((m) => m.dispose());
  }
}
