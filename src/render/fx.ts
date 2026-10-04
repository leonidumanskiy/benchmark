// Combat effects: muzzle flash + light, tracer beams, material-specific impacts, ichor, debris, casings, decals,
// camera shake. Render-only: consumes sim events, never touches sim state. Own seeded RNG -> reproducible visuals.
import * as THREE from 'three';
import { Rng } from '../sim/rng';
import { GameEvent, Shot, Sim } from '../sim/sim';
import { CFG } from '../sim/config';
import { Obstacle } from '../sim/arena';

const rng = new Rng(777);
const R = () => rng.next();
const RS = () => rng.next() * 2 - 1;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const starTex = canvasTex(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.15, 'rgba(255,220,150,0.9)'); gr.addColorStop(0.45, 'rgba(255,120,40,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    g.save(); g.translate(s / 2, s / 2); g.rotate((i / 6) * Math.PI * 2 + 0.3);
    const l = g.createLinearGradient(0, 0, s / 2, 0); l.addColorStop(0, 'rgba(255,240,200,0.9)'); l.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = l; g.beginPath(); g.moveTo(0, -3 - (i % 2) * 2); g.lineTo(s / 2 * (i % 2 ? 0.7 : 1), 0); g.lineTo(0, 3 + (i % 2) * 2); g.fill(); g.restore();
  }
});
const flameTex = canvasTex(128, (g, s) => {
  const gr = g.createLinearGradient(0, 0, s, 0);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,0.9)'); gr.addColorStop(0.7, 'rgba(255,90,30,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, s * 0.5); g.quadraticCurveTo(s * 0.3, s * 0.15, s, s * 0.5); g.quadraticCurveTo(s * 0.3, s * 0.85, 0, s * 0.5); g.fill();
});
const beamTex = canvasTex(64, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, 'rgba(255,90,40,0.6)'); gr.addColorStop(0.5, 'rgba(255,250,220,1)'); gr.addColorStop(0.65, 'rgba(255,90,40,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const splatTex = canvasTex(128, (g, s) => {
  const r = new Rng(91);
  for (let i = 0; i < 26; i++) {
    const a = r.next() * Math.PI * 2, d = r.next() * s * 0.32, rr = 4 + r.next() * 16;
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(150,10,20,0.95)'); gr.addColorStop(0.7, 'rgba(90,5,12,0.8)'); gr.addColorStop(1, 'rgba(60,0,8,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }
});
const scorchTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(5,5,5,0.95)'); gr.addColorStop(0.25, 'rgba(30,22,16,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

// ------------------------------------------------------------------ point particles (soft round, size in metres)
class PointSystem {
  readonly cap: number;
  readonly points: THREE.Points;
  private pos: Float32Array; private vel: Float32Array; private col: Float32Array; private base: Float32Array;
  private size: Float32Array; private size1: Float32Array; private alpha: Float32Array; private life: Float32Array; private max: Float32Array;
  private drag: Float32Array; private grav: Float32Array; private a0: Float32Array;
  private n = 0;
  uniforms = { uScale: { value: 40 }, uSizeMul: { value: 2.4 } };
  /** additive systems 'cool' (colour shifts to red while fading, like embers); smoke keeps its hue */
  private cooling: boolean;
  constructor(cap: number, additive: boolean, sizeMul = 2.4) {
    this.cooling = additive;
    this.uniforms.uSizeMul.value = sizeMul;
    this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.vel = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.base = new Float32Array(cap * 3);
    this.size = new Float32Array(cap); this.size1 = new Float32Array(cap); this.alpha = new Float32Array(cap); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.grav = new Float32Array(cap); this.a0 = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float psize; attribute float alpha; varying vec3 vC; varying float vA; uniform float uScale; uniform float uSizeMul;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * uScale * uSizeMul; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a; gl_FragColor = vec4(vC, a * vA); }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 6 : 5;
    this.points.userData.fx = true;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size0: number, size1: number, life: number, drag = 2, grav = 0, alpha = 1) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size0; this.size1[i] = size1; this.life[i] = life; this.max[i] = life; this.drag[i] = drag; this.grav[i] = grav; this.alpha[i] = alpha; this.a0[i] = alpha;
  }
  update(dt: number) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const t = 1 - this.life[i] / this.max[i];
      const k = Math.exp(-this.drag[i] * dt);
      const vx = this.vel[i * 3] * k, vy = this.vel[i * 3 + 1] * k - this.grav[i] * dt, vz = this.vel[i * 3 + 2] * k;
      let px = this.pos[i * 3] + vx * dt, py = this.pos[i * 3 + 1] + vy * dt, pz = this.pos[i * 3 + 2] + vz * dt;
      if (py < 0.02) py = 0.02;
      // compact
      this.pos[w * 3] = px; this.pos[w * 3 + 1] = py; this.pos[w * 3 + 2] = pz;
      this.vel[w * 3] = vx; this.vel[w * 3 + 1] = vy; this.vel[w * 3 + 2] = vz;
      this.base[w * 3] = this.base[i * 3]; this.base[w * 3 + 1] = this.base[i * 3 + 1]; this.base[w * 3 + 2] = this.base[i * 3 + 2];
      const fade = 1 - t;
      if (this.cooling) { this.col[w * 3] = this.base[w * 3] * fade; this.col[w * 3 + 1] = this.base[w * 3 + 1] * fade * fade; this.col[w * 3 + 2] = this.base[w * 3 + 2] * fade * fade; }
      else { this.col[w * 3] = this.base[w * 3]; this.col[w * 3 + 1] = this.base[w * 3 + 1]; this.col[w * 3 + 2] = this.base[w * 3 + 2]; }
      this.life[w] = this.life[i]; this.max[w] = this.max[i]; this.drag[w] = this.drag[i]; this.grav[w] = this.grav[i];
      this.size1[w] = this.size1[i];
      this.size[w] = this.size[i] + (this.size1[i] - this.size[i]) * Math.min(1, dt * 3);
      this.a0[w] = this.a0[i];
      this.alpha[w] = Math.min(1, fade * 1.6) * this.a0[w];
      w++;
    }
    this.n = w;
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'psize', 'alpha']) (g.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }
  get count() { return this.n; }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ------------------------------------------------------------------ sparks (velocity-stretched streaks)
class SparkSystem {
  readonly cap: number; readonly lines: THREE.LineSegments;
  private p: Float32Array; private v: Float32Array; private c: Float32Array; private life: Float32Array; private max: Float32Array; private col: Float32Array; private pos: Float32Array;
  private n = 0;
  constructor(cap: number) {
    this.cap = cap;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.c = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.pos = new Float32Array(cap * 6); this.col = new Float32Array(cap * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 7; this.lines.userData.fx = true;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, life: number) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.p.set([p.x, p.y, p.z], i * 3); this.v.set([v.x, v.y, v.z], i * 3); this.c.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life; this.max[i] = life;
  }
  update(dt: number) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt; if (this.life[i] <= 0) continue;
      let vx = this.v[i * 3] * Math.exp(-1.5 * dt), vy = this.v[i * 3 + 1] - 9.8 * dt, vz = this.v[i * 3 + 2] * Math.exp(-1.5 * dt);
      let px = this.p[i * 3] + vx * dt, py = this.p[i * 3 + 1] + vy * dt, pz = this.p[i * 3 + 2] + vz * dt;
      if (py < 0.02 && vy < 0) { py = 0.02; vy = -vy * 0.35; vx *= 0.6; vz *= 0.6; } // bounce
      this.p[w * 3] = px; this.p[w * 3 + 1] = py; this.p[w * 3 + 2] = pz;
      this.v[w * 3] = vx; this.v[w * 3 + 1] = vy; this.v[w * 3 + 2] = vz;
      this.c[w * 3] = this.c[i * 3]; this.c[w * 3 + 1] = this.c[i * 3 + 1]; this.c[w * 3 + 2] = this.c[i * 3 + 2];
      this.life[w] = this.life[i]; this.max[w] = this.max[i];
      const f = this.life[w] / this.max[w];
      const st = 0.035; // streak length = velocity * st
      this.pos.set([px, py, pz, px - vx * st, py - vy * st, pz - vz * st], w * 6);
      const r = this.c[w * 3] * f, gg = this.c[w * 3 + 1] * f * f, b = this.c[w * 3 + 2] * f * f * f;
      this.col.set([r, gg, b, r * 0.3, gg * 0.2, b * 0.1], w * 6);
      w++;
    }
    this.n = w;
    const g = this.lines.geometry; g.setDrawRange(0, this.n * 2);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  get count() { return this.n; }
  clear() { this.n = 0; this.lines.geometry.setDrawRange(0, 0); }
}

// ------------------------------------------------------------------ rigid debris (chips, shards, casings)
class DebrisSystem {
  readonly mesh: THREE.InstancedMesh; readonly cap: number;
  private items: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; s: THREE.Vector3; life: number; max: number }[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion();
  constructor(cap: number) {
    this.cap = cap;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.userData.fx = true;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, size: THREE.Vector3, color: THREE.Color, life: number) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({ p: p.clone(), v: v.clone(), r: new THREE.Euler(R() * 6, R() * 6, R() * 6), w: new THREE.Vector3(RS() * 20, RS() * 20, RS() * 20), s: size.clone(), life, max: life });
    (this.items[this.items.length - 1] as any).c = color.clone();
  }
  update(dt: number) {
    this.items = this.items.filter((d) => (d.life -= dt) > 0);
    this.items.forEach((d, i) => {
      d.v.y -= 9.8 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s.y * 0.5) { d.p.y = d.s.y * 0.5; d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; d.w.multiplyScalar(0.5); }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      const shrink = Math.min(1, d.life / (d.max * 0.3));
      this.m.compose(d.p, this.q.setFromEuler(d.r), d.s.clone().multiplyScalar(shrink));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, (d as any).c);
    });
    this.mesh.count = this.items.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  get count() { return this.items.length; }
  clear() { this.items = []; this.mesh.count = 0; }
}

interface Timed { obj: THREE.Object3D; life: number; max: number; kind: 'flash' | 'beam' | 'decal' | 'muzzle'; data?: any }

export interface FxStats { sparks: number; glow: number; smoke: number; debris: number; timed: number; lights: number; spawned: Record<string, number>; lastImpactTick: number; lastImpactShot: number }

export class FX {
  readonly group = new THREE.Group();
  readonly sparks = new SparkSystem(2400);
  readonly glow = new PointSystem(1500, true);
  readonly smoke = new PointSystem(600, false, 1.3);
  readonly debris = new DebrisSystem(360);
  readonly lights: { light: THREE.PointLight; life: number; max: number; peak: number }[] = [];
  private timed: Timed[] = [];
  private flashPool: THREE.Sprite[] = [];
  shake = 0;
  stats: FxStats = { sparks: 0, glow: 0, smoke: 0, debris: 0, timed: 0, lights: 0, spawned: {}, lastImpactTick: -1, lastImpactShot: -1 };
  /** intensity multiplier for effect amounts (visual tuning only) */
  intensity = 1;

  constructor(private scene: THREE.Scene, private sim: Sim) {
    this.group.name = 'fx';
    this.group.add(this.sparks.lines, this.glow.points, this.smoke.points, this.debris.mesh);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 7, 1.6);
      l.userData.fx = true;
      this.group.add(l);
      this.lights.push({ light: l, life: 0, max: 1, peak: 0 });
    }
    scene.add(this.group);
  }

  private count(k: string) { this.stats.spawned[k] = (this.stats.spawned[k] ?? 0) + 1; }

  private flash(pos: THREE.Vector3, size: number, life: number, color = 0xffffff) {
    let s = this.flashPool.pop();
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); s.userData.fx = true; s.renderOrder = 8; }
    (s.material as THREE.SpriteMaterial).color.set(color);
    (s.material as THREE.SpriteMaterial).rotation = R() * Math.PI;
    s.position.copy(pos); s.scale.setScalar(size); s.visible = true;
    this.group.add(s);
    this.timed.push({ obj: s, life, max: life, kind: 'flash', data: size });
  }

  private light(pos: THREE.Vector3, color: number, peak: number, life: number) {
    // reuse the weakest light (fixed pool => no shader recompiles)
    const L = this.lights.reduce((a, b) => (a.light.intensity * a.life <= b.light.intensity * b.life ? a : b));
    L.light.position.copy(pos); L.light.color.set(color); L.peak = peak; L.life = life; L.max = life; L.light.intensity = peak;
  }

  private beam(a: THREE.Vector3, b: THREE.Vector3, width: number, life: number, color: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: beamTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 7; m.userData.fx = true;
    this.group.add(m);
    this.timed.push({ obj: m, life, max: life, kind: 'beam', data: { a: a.clone(), b: b.clone(), width } });
  }

  private decal(pos: THREE.Vector3, normal: THREE.Vector3, size: number, tex: THREE.Texture, life: number, opacity = 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.3, metalness: 0, opacity }));
    m.position.copy(pos).addScaledVector(normal, 0.012);
    m.lookAt(pos.clone().add(normal)); m.rotateZ(R() * 6);
    m.userData.fx = true; m.renderOrder = 2; m.receiveShadow = true;
    this.group.add(m);
    this.timed.push({ obj: m, life, max: life, kind: 'decal', data: opacity });
    // cap decals
    const decals = this.timed.filter((t) => t.kind === 'decal');
    if (decals.length > 70) decals[0].life = Math.min(decals[0].life, 0.3);
  }

  // ---------------------------------------------------------------- event handlers
  handle(events: GameEvent[], muzzleWorld: () => THREE.Vector3, playerPos: THREE.Vector3) {
    for (const e of events) {
      if (e.type === 'shot') this.onShot(e.shot, muzzleWorld());
      else if (e.type === 'monster_killed') this.onKill(e.id);
      else if (e.type === 'player_hit') this.onPlayerHit(playerPos);
    }
  }

  /** world-space impact point + surface normal for a shot, matching the sim ray end exactly in x/z */
  impactPoint(s: Shot): { p: THREE.Vector3; n: THREE.Vector3; ob?: Obstacle } {
    const ux = Math.cos(s.angle), uz = Math.sin(s.angle);
    if (s.hitKind === 'monster') return { p: new THREE.Vector3(s.to.x, 0.95, s.to.z), n: new THREE.Vector3(-ux, 0, -uz) };
    if (s.hitKind === 'obstacle') {
      const ob = this.sim.obstacles.find((o) => o.id === s.hitId)!;
      const sh = ob.shape;
      let n: THREE.Vector3;
      if (sh.kind === 'circle') n = new THREE.Vector3(s.to.x - sh.cx, 0, s.to.z - sh.cz).normalize();
      else {
        const dx = (s.to.x - sh.cx) / sh.hw, dz = (s.to.z - sh.cz) / sh.hd;
        n = Math.abs(dx) > Math.abs(dz) ? new THREE.Vector3(Math.sign(dx), 0, 0) : new THREE.Vector3(0, 0, Math.sign(dz));
      }
      const y = Math.min(CFG.weapon.muzzleHeight, ob.height * 0.8);
      return { p: new THREE.Vector3(s.to.x, y, s.to.z), n, ob };
    }
    return { p: new THREE.Vector3(s.to.x, CFG.weapon.muzzleHeight, s.to.z), n: new THREE.Vector3(-ux, 0, -uz) };
  }

  onShot(s: Shot, muzzle: THREE.Vector3) {
    const k = this.intensity;
    const ux = Math.cos(s.angle), uz = Math.sin(s.angle);
    const dir = new THREE.Vector3(ux, 0, uz);
    this.count('shot');
    // muzzle: flash sprite + flame quads + light + smoke + casing
    this.flash(muzzle.clone().addScaledVector(dir, 0.1), 1.3 + R() * 0.5, 0.065);
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.42), new THREE.MeshBasicMaterial({ map: flameTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    flame.geometry.translate(0.52, 0, 0);
    flame.position.copy(muzzle); flame.rotation.set(R() * Math.PI, -s.angle, 0, 'YXZ'); flame.userData.fx = true; flame.renderOrder = 8;
    this.group.add(flame);
    this.timed.push({ obj: flame, life: 0.05, max: 0.05, kind: 'muzzle' });
    this.light(muzzle.clone().addScaledVector(dir, 0.3), 0xffb050, 9, 0.07);
    for (let i = 0; i < 3 * k; i++) this.smoke.emit(muzzle.clone(), dir.clone().multiplyScalar(1 + R()).add(new THREE.Vector3(RS() * 0.3, 0.4 + R() * 0.3, RS() * 0.3)), new THREE.Color(0.55, 0.55, 0.58), 0.1, 0.4, 0.5 + R() * 0.3, 2.5, -0.4, 0.14);
    for (let i = 0; i < 4 * k; i++) this.glow.emit(muzzle.clone(), dir.clone().multiplyScalar(5 + R() * 6).add(new THREE.Vector3(RS(), RS() * 0.6, RS())), new THREE.Color(1, 0.6, 0.2), 0.05, 0.02, 0.12, 4);
    const right = new THREE.Vector3(-uz, 0, ux);
    this.debris.emit(muzzle.clone().addScaledVector(dir, -0.75).addScaledVector(right, 0.08), right.clone().multiplyScalar(-1.6 - R()).add(new THREE.Vector3(RS() * 0.4, 2 + R(), RS() * 0.4)), new THREE.Vector3(0.025, 0.025, 0.06), new THREE.Color(0.5, 0.36, 0.14), 1.0);
    this.shake = Math.min(1, this.shake + 0.12);
    // tracer beam: muzzle -> exact sim hit point
    const imp = this.impactPoint(s);
    this.beam(muzzle, imp.p, 0.16, 0.1, 0xffe8c0);
    this.beam(muzzle, imp.p, 0.5, 0.075, 0xff5a20);
    // impact (same frame as the hit/damage event)
    this.stats.lastImpactTick = s.tick; this.stats.lastImpactShot = s.id;
    if (s.hitKind === 'monster') this.impactFlesh(imp.p, dir);
    else if (s.material === 'metal') this.impactMetal(imp.p, imp.n);
    else if (s.material === 'stone') this.impactStone(imp.p, imp.n);
  }

  impactMetal(p: THREE.Vector3, n: THREE.Vector3) {
    this.count('impact_metal');
    const k = this.intensity;
    this.flash(p.clone().addScaledVector(n, 0.05), 1.1, 0.08, 0xffe8b0);
    this.light(p.clone().addScaledVector(n, 0.4), 0xffc070, 3.2, 0.09);
    for (let i = 0; i < 30 * k; i++) {
      const v = n.clone().multiplyScalar(3 + R() * 6).add(new THREE.Vector3(RS() * 5, 1 + R() * 5, RS() * 5));
      this.sparks.emit(p, v, new THREE.Color(1, 0.75 + R() * 0.25, 0.4), 0.3 + R() * 0.5);
    }
    for (let i = 0; i < 4 * k; i++) this.glow.emit(p.clone(), n.clone().multiplyScalar(1 + R() * 2).add(new THREE.Vector3(RS(), R() * 2, RS())), new THREE.Color(1, 0.7, 0.3), 0.07, 0.02, 0.25, 3, 5);
    for (let i = 0; i < 2 * k; i++) this.smoke.emit(p.clone(), n.clone().multiplyScalar(0.6).add(new THREE.Vector3(RS() * 0.3, 0.5, RS() * 0.3)), new THREE.Color(0.35, 0.36, 0.4), 0.12, 0.45, 0.6, 2, -0.3, 0.2);
    this.decal(p, n, 0.22, scorchTex, 8, 0.9);
  }

  impactStone(p: THREE.Vector3, n: THREE.Vector3) {
    this.count('impact_stone');
    const k = this.intensity;
    this.flash(p.clone().addScaledVector(n, 0.05), 0.8, 0.06, 0xffd8a0);
    this.light(p.clone().addScaledVector(n, 0.4), 0xffb070, 2.5, 0.07);
    for (let i = 0; i < 5 * k; i++) this.smoke.emit(p.clone().addScaledVector(n, 0.1), n.clone().multiplyScalar(0.8 + R() * 1.5).add(new THREE.Vector3(RS() * 0.8, 0.3 + R() * 0.8, RS() * 0.8)), new THREE.Color(0.6, 0.55, 0.48), 0.14, 0.6, 0.7 + R() * 0.5, 2.2, -0.2, 0.22);
    for (let i = 0; i < 7 * k; i++) {
      const s = 0.03 + R() * 0.05;
      this.debris.emit(p.clone().addScaledVector(n, 0.05), n.clone().multiplyScalar(1.5 + R() * 3).add(new THREE.Vector3(RS() * 2, 1 + R() * 3, RS() * 2)), new THREE.Vector3(s, s * 0.7, s), new THREE.Color(0.45, 0.42, 0.38), 1.2 + R());
    }
    for (let i = 0; i < 5 * k; i++) this.sparks.emit(p, n.clone().multiplyScalar(2 + R() * 3).add(new THREE.Vector3(RS() * 2, R() * 3, RS() * 2)), new THREE.Color(1, 0.6, 0.3), 0.15 + R() * 0.2);
    this.decal(p, n, 0.26, scorchTex, 8, 0.75);
  }

  impactFlesh(p: THREE.Vector3, dir: THREE.Vector3) {
    this.count('impact_flesh');
    const k = this.intensity;
    this.flash(p.clone().addScaledVector(dir, -0.35), 0.8, 0.06, 0xff4a30);
    this.light(p.clone().addScaledVector(dir, -0.9), 0xff2a10, 1.4, 0.09);
    // ichor: glowing droplets sprayed out the back and toward the shooter
    for (let i = 0; i < 22 * k; i++) {
      const back = R() < 0.65 ? 1 : -0.6;
      const v = dir.clone().multiplyScalar(back * (2 + R() * 4)).add(new THREE.Vector3(RS() * 2, 1 + R() * 3, RS() * 2));
      this.glow.emit(p.clone(), v, new THREE.Color(1, 0.12 + R() * 0.1, 0.08), 0.07 + R() * 0.06, 0.03, 0.35 + R() * 0.35, 1.5, 9);
    }
    for (let i = 0; i < 5 * k; i++) this.smoke.emit(p.clone(), dir.clone().multiplyScalar(0.5 + R()).add(new THREE.Vector3(RS() * 0.5, 0.3, RS() * 0.5)), new THREE.Color(0.45, 0.05, 0.06), 0.16, 0.45, 0.45, 3, 0, 0.35);
    for (let i = 0; i < 3 * k; i++) {
      const s = 0.04 + R() * 0.05;
      this.debris.emit(p.clone(), dir.clone().multiplyScalar(2 + R() * 2).add(new THREE.Vector3(RS() * 2, 1.5 + R() * 2, RS() * 2)), new THREE.Vector3(s, s * 0.4, s * 1.4), new THREE.Color(0.55, 0.58, 0.64), 1 + R());
    }
    if (R() < 0.5) this.decal(new THREE.Vector3(p.x + dir.x * (0.6 + R()), 0.01, p.z + dir.z * (0.6 + R())), new THREE.Vector3(0, 1, 0), 0.5 + R() * 0.4, splatTex, 7, 0.9);
  }

  onKill(id: string) {
    this.count('kill');
    const m = this.sim.monsters.find((x) => x.id === id);
    if (!m) return;
    const k = this.intensity;
    const p = new THREE.Vector3(m.pos.x, 0.8, m.pos.z);
    this.flash(p, 1.8, 0.12, 0xff5040);
    this.light(p.clone().setY(1.6), 0xff3020, 5, 0.25);
    for (let i = 0; i < 40 * k; i++) {
      const v = new THREE.Vector3(RS(), 0.5 + R(), RS()).normalize().multiplyScalar(2 + R() * 5);
      this.glow.emit(p.clone(), v, new THREE.Color(1, 0.15 + R() * 0.15, 0.08), 0.08 + R() * 0.08, 0.03, 0.5 + R() * 0.5, 1.2, 9);
    }
    for (let i = 0; i < 12 * k; i++) this.smoke.emit(p.clone(), new THREE.Vector3(RS() * 1.5, 0.5 + R(), RS() * 1.5), new THREE.Color(0.3, 0.05, 0.06), 0.25, 0.9, 0.9 + R() * 0.5, 2, -0.2, 0.35);
    for (let i = 0; i < 12 * k; i++) {
      const s = 0.06 + R() * 0.1;
      this.debris.emit(p.clone(), new THREE.Vector3(RS() * 4, 2 + R() * 4, RS() * 4), new THREE.Vector3(s, s * 0.35, s * 1.6), R() < 0.6 ? new THREE.Color(0.55, 0.58, 0.64) : new THREE.Color(0.7, 0.08, 0.1), 2 + R());
    }
    this.decal(new THREE.Vector3(m.pos.x, 0.01, m.pos.z), new THREE.Vector3(0, 1, 0), 1.6 + R() * 0.5, splatTex, 10, 1);
    this.shake = Math.min(1, this.shake + 0.25);
  }

  onPlayerHit(p: THREE.Vector3) {
    this.count('player_hit');
    const q = p.clone().setY(1.2);
    for (let i = 0; i < 14; i++) this.sparks.emit(q, new THREE.Vector3(RS() * 4, 1 + R() * 3, RS() * 4), new THREE.Color(1, 0.8, 0.5), 0.3 + R() * 0.3);
    this.flash(q, 0.7, 0.06, 0xffc0a0);
    this.shake = Math.min(1, this.shake + 0.6);
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, camera: THREE.Camera, viewportHeight: number, halfHeight: number) {
    const scale = viewportHeight / (2 * halfHeight);
    this.glow.uniforms.uScale.value = scale; this.smoke.uniforms.uScale.value = scale;
    this.sparks.update(dt); this.glow.update(dt); this.smoke.update(dt); this.debris.update(dt);
    const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.life -= dt;
      const f = Math.max(0, t.life / t.max);
      if (t.kind === 'flash') { (t.obj as THREE.Sprite).material.opacity = f; t.obj.scale.setScalar(t.data * (0.7 + 0.3 * f)); }
      else if (t.kind === 'muzzle') { ((t.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = f; }
      else if (t.kind === 'beam') {
        const { a, b, width } = t.data as { a: THREE.Vector3; b: THREE.Vector3; width: number };
        const d = b.clone().sub(a); const side = d.clone().cross(camDir).normalize().multiplyScalar(width * (0.5 + 0.5 * f) / 2);
        const pos = (t.obj as THREE.Mesh).geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, a.x - side.x, a.y - side.y, a.z - side.z); pos.setXYZ(1, b.x - side.x, b.y - side.y, b.z - side.z);
        pos.setXYZ(2, a.x + side.x, a.y + side.y, a.z + side.z); pos.setXYZ(3, b.x + side.x, b.y + side.y, b.z + side.z);
        pos.needsUpdate = true;
        ((t.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = f;
      } else if (t.kind === 'decal') { ((t.obj as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = Math.min(1, t.life / 1.5) * t.data; }
      if (t.life <= 0) {
        this.group.remove(t.obj);
        if (t.kind === 'flash') this.flashPool.push(t.obj as THREE.Sprite);
        else { const m = t.obj as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
        this.timed.splice(i, 1);
      }
    }
    for (const L of this.lights) { L.life = Math.max(0, L.life - dt); L.light.intensity = L.peak * Math.pow(L.life / L.max, 1.5); }
    this.shake = Math.max(0, this.shake - dt * 3.5);
    this.stats.sparks = this.sparks.count; this.stats.glow = this.glow.count; this.stats.smoke = this.smoke.count; this.stats.debris = this.debris.count;
    this.stats.timed = this.timed.length; this.stats.lights = this.lights.filter((l) => l.light.intensity > 0.01).length;
  }

  activeCount() { const s = this.stats; return s.sparks + s.glow + s.smoke + s.debris + this.timed.filter((t) => t.kind !== 'decal').length + s.lights; }

  clear() {
    this.sparks.clear(); this.glow.clear(); this.smoke.clear(); this.debris.clear();
    for (const t of this.timed) { this.group.remove(t.obj); if (t.kind !== 'flash') { const m = t.obj as THREE.Mesh; m.geometry.dispose(); (m.material as THREE.Material).dispose(); } else this.flashPool.push(t.obj as THREE.Sprite); }
    this.timed = []; for (const L of this.lights) { L.life = 0; L.light.intensity = 0; }
    this.shake = 0;
  }
}
