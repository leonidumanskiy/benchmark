// Renderer: reads Sim state, never writes it. Visual-only randomness uses its own RNG.
import * as THREE from 'three';
import { Sim, Shot, GameEvent } from '../sim/sim';
import { CFG } from '../sim/config';
import { sectorPolygon } from '../sim/visibility';
import { makeIsoCamera, makePerspCamera, fitPersp, cameraOffset, resizeIsoCamera, GameCamera, AIM_PLANE_Y, zoom } from './iso';
import { Settings, DEFAULT_SETTINGS } from '../settings';
import { loadHd, hdReady } from '../assets/hd/hd';
import { buildEnvironmentHd } from '../assets/hd/envkit';
import { FX } from './fx';
import { Lighting } from './lighting';
import { Post } from './post';
import { PlayerView, MonsterView } from './actors';
import { PLAYER_SPEC, PlayerSpec } from '../assets/player';
import { MONSTER_SPEC, MonsterSpec } from '../assets/monster';
import { deepMerge } from '../util';
import { buildObstacle, buildDecor, buildGround, buildBackdrop, LampAnchor } from '../assets/environment';


export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  camera: GameCamera;
  readonly isoCamera: THREE.OrthographicCamera;
  readonly perspCamera: THREE.PerspectiveCamera;
  settings: Settings = { ...DEFAULT_SETTINGS };
  /** classic obstacle visuals (one group per obstacle) and the HD environment kit (built on first use) */
  envClassic: THREE.Object3D[] = [];
  envHd: THREE.Group | null = null;
  /** last HD load failure (shown in the pause menu) */
  hdError = '';
  readonly camTarget = new THREE.Vector3();
  debug = false;
  /** camera focus override (evidence/debug); null = follow player */
  focus: { x: number; z: number } | null = null;
  fxEnabled = true;

  player: PlayerView;
  playerSpec: PlayerSpec = PLAYER_SPEC;
  monsterSpec: MonsterSpec = MONSTER_SPEC;
  monsters = new Map<string, MonsterView>();
  lamps: LampAnchor[] = [];
  fx: FX;
  post!: Post;
  lighting: Lighting;
  private overlay: THREE.Group = new THREE.Group();
  private sectorMesh: THREE.Mesh;
  private nearRing: THREE.Mesh;
  private labels: HTMLDivElement;

  constructor(private sim: Sim, private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.isoCamera = makeIsoCamera(window.innerWidth / window.innerHeight);
    this.perspCamera = makePerspCamera(window.innerWidth / window.innerHeight, DEFAULT_SETTINGS.focal);
    this.camera = this.isoCamera;
    this.scene.background = new THREE.Color(0x101418);

    // simple test lighting
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.add(buildGround());
    for (const ob of sim.obstacles) { const m = buildObstacle(ob, this.lamps); m.userData.obstacle = ob.id; this.scene.add(m); this.envClassic.push(m); }
    this.scene.add(buildDecor(sim.decor, sim.spawns, sim.obstacles));
    this.scene.add(buildBackdrop(this.lamps));

    this.player = new PlayerView();
    this.scene.add(this.player.rig.root);
    this.fx = new FX(this.scene, sim);
    this.lighting = new Lighting(this.scene, this.renderer, this.lamps);

    // visibility overlay: sector fan + near circle (placeholder visual for the vision system)
    this.sectorMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sectorMesh.position.y = 0.04; this.sectorMesh.renderOrder = 2;
    this.nearRing = new THREE.Mesh(new THREE.RingGeometry(CFG.vision.nearRadius - 0.06, CFG.vision.nearRadius, 64), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18, depthWrite: false }));
    this.nearRing.rotation.x = -Math.PI / 2; this.nearRing.position.y = 0.05;
    this.overlay.add(this.sectorMesh, this.nearRing);
    this.scene.add(this.overlay);

    this.post = new Post(this.renderer, this.scene, this.camera);
    this.labels = document.createElement('div');
    this.labels.id = 'debug-labels';
    document.body.appendChild(this.labels);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    resizeIsoCamera(this.isoCamera, w / h);
    fitPersp(this.perspCamera, w / h, this.settings.focal);
  }

  // ------------------------------------------------------------- coordinate helpers
  updateCamera(snap = false) {
    const p = this.focus ?? this.sim.player.pos;
    const k = snap || this.focus ? 1 : 0.15;
    this.camTarget.x += (p.x - this.camTarget.x) * k;
    this.camTarget.z += (p.z - this.camTarget.z) * k;
    this.camera.position.copy(this.camTarget).add(cameraOffset(this.camera));
    this.camera.lookAt(this.camTarget);
    this.camera.updateMatrixWorld();
  }

  /** client pixel -> world point on the aim plane */
  screenToWorld(cx: number, cy: number, planeY = AIM_PLANE_Y) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), out);
    return { x: out.x, z: out.z };
  }

  worldToScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // ------------------------------------------------------------- per frame
  update(dt: number, events: GameEvent[]) {
    const sim = this.sim;
    this.updateCamera();
    const P = sim.player;
    this.player.update(sim, dt);
    const seen = new Set<string>();
    for (const m of sim.monsters) {
      seen.add(m.id);
      let v = this.monsters.get(m.id);
      if (!v) { v = new MonsterView(m.id, this.monsterSpec); this.monsters.set(m.id, v); this.scene.add(v.rig.root); }
      v.update(m, sim, this.camera, dt);
    }
    for (const [id, v] of this.monsters) if (!seen.has(id)) { this.scene.remove(v.rig.root); v.dispose(); this.monsters.delete(id); }

    if (this.fxEnabled) this.fx.handle(events, () => this.player.rig.muzzle.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(P.pos.x, 0, P.pos.z));
    this.lighting.update(dt, sim, this.player.rig);
    this.fx.update(dt, this.camera, this.canvas.clientHeight || window.innerHeight, zoom.half);

    // overlay
    const poly = sectorPolygon(sim.obstacles, P.pos.x, P.pos.z, P.aimAngle, 48);
    const pos: number[] = [];
    for (let i = 1; i < poly.length - 1; i++) pos.push(poly[0][0], 0, poly[0][1], poly[i + 1][0], 0, poly[i + 1][1], poly[i][0], 0, poly[i][1]);
    this.sectorMesh.geometry.dispose();
    this.sectorMesh.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.nearRing.position.set(P.pos.x, 0.05, P.pos.z);
    this.updateLabels();
  }

  private updateLabels() {
    this.overlay.visible = this.debug; // vision fan + near ring: debug overlay only (the flashlight shows the cone in normal play)
    if (!this.debug) { this.labels.innerHTML = ''; return; }
    const parts: string[] = [];
    for (const m of this.sim.monsters) {
      const s = this.worldToScreen(m.pos.x, 2.4, m.pos.z);
      const col = m.vis.visible ? '#7f7' : '#f77';
      parts.push(`<div class="lbl" style="left:${s.x}px;top:${s.y}px;color:${col}">${m.id} ${m.vis.reason}${m.vis.occluder ? ' ▸ ' + m.vis.occluder : ''}</div>`);
    }
    this.labels.innerHTML = parts.join('');
  }

  render() {
    // camera shake is applied only for the draw call, so aiming (screen->world) is never affected by effects
    const sh = this.fx.shake * this.fx.shake * 0.12;
    const saved = this.camera.position.clone();
    if (sh > 0) { const t = performance.now() * 0.05; this.camera.position.x += Math.sin(t * 1.7) * sh; this.camera.position.z += Math.cos(t * 2.3) * sh; this.camera.updateMatrixWorld(); }
    this.post.render(this.scene, this.camera);
    if (sh > 0) { this.camera.position.copy(saved); this.camera.updateMatrixWorld(); }
  }

  onReset() { this.fx.clear(); }

  /** Rebuild actor visuals from the shared spec with overrides (gameplay untouched). */
  respec(kind: 'player' | 'monster', override: unknown) {
    if (kind === 'player') {
      this.playerSpec = { ...deepMerge(PLAYER_SPEC, override), skin: this.settings.player };
      this.scene.remove(this.player.rig.root);
      this.player = new PlayerView(this.playerSpec);
      this.scene.add(this.player.rig.root);
    } else {
      this.monsterSpec = { ...deepMerge(MONSTER_SPEC, override), skin: this.settings.monster };
      for (const [, v] of this.monsters) { this.scene.remove(v.rig.root); v.dispose(); }
      this.monsters.clear();
    }
    return kind === 'player' ? this.playerSpec : this.monsterSpec;
  }

  /** Apply visual settings. HD assets load asynchronously; until they arrive the classic visuals stay up. */
  applySettings(next: Settings): Promise<void> {
    const prev = this.settings;
    this.settings = { ...next };
    // camera
    const cam = next.camera === 'persp' ? this.perspCamera : this.isoCamera;
    if (cam !== this.camera || next.focal !== prev.focal) {
      this.camera = cam; this.post.setCamera(cam); this.resize(); this.updateCamera(true);
    }
    const jobs: Promise<unknown>[] = [];
    const want = (kind: 'player' | 'monster' | 'envkit', on: boolean, apply: () => void) => {
      if (!on || hdReady(kind)) { apply(); return; }
      jobs.push(loadHd(kind).then(() => { if (this.settings === next || JSON.stringify(this.settings) === JSON.stringify(next)) apply(); })
        .catch((e) => { this.hdError = `${kind}: ${e?.message ?? e}`; console.warn('HD asset load failed', e); }));
    };
    if (next.player !== prev.player || next.player !== this.player.rig.skin) want('player', next.player === 'hd', () => this.rebuildPlayer());
    if (next.monster !== prev.monster || (this.monsterSpec.skin ?? 'classic') !== next.monster) want('monster', next.monster === 'hd', () => this.rebuildMonsters());
    if (next.env !== prev.env || (next.env === 'hd') !== !!this.envHd?.visible) {
      if (next.env === 'hd' && !hdReady('floor')) jobs.push(loadHd('floor').catch((e) => { this.hdError = `floor: ${e?.message ?? e}`; }));
      want('envkit', next.env === 'hd', () => this.setEnv(next.env));
    }
    return Promise.all(jobs).then(() => undefined);
  }

  private rebuildPlayer() {
    const spec = { ...this.playerSpec, skin: this.settings.player };
    this.playerSpec = spec;
    const old = this.player;
    this.scene.remove(old.rig.root);
    this.player = new PlayerView(spec);
    this.scene.add(this.player.rig.root);
  }

  private rebuildMonsters() {
    this.monsterSpec = { ...this.monsterSpec, skin: this.settings.monster };
    for (const [, v] of this.monsters) { this.scene.remove(v.rig.root); v.dispose(); }
    this.monsters.clear(); // re-created from sim state on the next update
  }

  private setEnv(mode: 'classic' | 'hd') {
    if (mode === 'hd' && !this.envHd && hdReady('envkit')) {
      this.envHd = buildEnvironmentHd(hdReady('envkit')!, hdReady('floor'), this.sim.obstacles, this.sim.spawns, this.lamps);
      this.scene.add(this.envHd);
    }
    const hd = mode === 'hd' && !!this.envHd;
    if (this.envHd) this.envHd.visible = hd;
    for (const g of this.envClassic) g.visible = !hd;
    const ground = this.scene.getObjectByName('ground');
    if (ground) ground.visible = !(hd && this.envHd!.getObjectByName('floorHd'));
  }

  isRendered(id: string) { const v = this.monsters.get(id); return !!v && v.rig.root.visible; }

  sceneInfo() {
    let meshes = 0, tris = 0;
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) { meshes++; const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
    return { meshes, tris: Math.round(tris), drawCalls: this.renderer.info.render.calls, fx: { ...this.fx.stats, active: this.fx.activeCount() } };
  }

  /**
   * Pixel coverage per monster from an ID render pass.
   * full: pixels in the real scene (respecting gameplay visibility and depth occlusion by geometry).
   * solo: pixels when only that monster is drawn (is it on screen at all?).
   */
  /** Per-pixel monster ID mask (0 = none, k+1 = ids[k]) at width W, respecting depth and gameplay visibility. */
  monsterMask(W = 320) {
    const H = Math.round((W * this.canvas.clientHeight) / this.canvas.clientWidth);
    const rt = new THREE.WebGLRenderTarget(W, H);
    const ids = [...this.monsters.keys()];
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mats = ids.map((_, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0, (i + 1) / 255, 1) }));
    const saved: [THREE.Object3D, any, boolean][] = [];
    this.scene.traverse((o) => {
      const any = o as any;
      if (!(any.isMesh || any.isLine || any.isPoints || any.isSprite)) return;
      saved.push([o, any.material, o.visible]);
      if (o.userData.ui || o.userData.fx || any.isLine || any.isPoints || any.isSprite) { o.visible = false; return; }
      let p: THREE.Object3D | null = o, idx = -1;
      while (p) { if (p.userData.monster) { idx = ids.indexOf(p.userData.monster); break; } p = p.parent; }
      any.material = idx >= 0 ? mats[idx] : black;
    });
    const bg = this.scene.background; this.scene.background = new THREE.Color(0);
    this.renderer.setRenderTarget(rt); this.renderer.render(this.scene, this.camera); this.renderer.setRenderTarget(null);
    this.scene.background = bg;
    for (const [o, m, v] of saved) { (o as any).material = m; o.visible = v; }
    const buf = new Uint8Array(W * H * 4); this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = ((H - 1 - y) * W + x) * 4; if (buf[i + 2] > 250) mask[y * W + x] = buf[i + 1]; }
    rt.dispose(); black.dispose(); mats.forEach((m) => m.dispose());
    return { W, H, ids, mask: Array.from(mask) };
  }

  coverage(): Record<string, { full: number; solo: number; visibleFlag: boolean }> {
    const W = 320, H = Math.round((320 * this.canvas.clientHeight) / this.canvas.clientWidth);
    const rt = new THREE.WebGLRenderTarget(W, H);
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const saved = new Map<THREE.Object3D, { mat: THREE.Material | THREE.Material[]; vis: boolean }>();
    const ids = [...this.monsters.keys()];
    const idOf = new Map<THREE.Object3D, number>();
    this.scene.traverse((o) => {
      let p: THREE.Object3D | null = o, idx = -1;
      while (p) { if (p.userData.monster) { idx = ids.indexOf(p.userData.monster); break; } p = p.parent; }
      idOf.set(o, idx);
    });
    const colorMats = ids.map((_, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(((i + 1) * 37 % 255) / 255, (i + 1) / 255, 1) }));
    const read = (solo: boolean) => {
      this.scene.traverse((o) => {
        const any = o as any;
        if (!saved.has(o)) saved.set(o, { mat: any.material, vis: o.visible });
        const idx = idOf.get(o) ?? -1;
        if (any.isMesh || any.isLine || any.isPoints || any.isSprite) {
          if (o.userData.ui || o.userData.fx || any.isLine || any.isPoints || any.isSprite) { o.visible = false; return; }
          if (idx >= 0) any.material = colorMats[idx];
          else { any.material = black; if (solo) o.visible = false; }
        }
      });
      const bg = this.scene.background; this.scene.background = new THREE.Color(0);
      this.renderer.setRenderTarget(rt); this.renderer.render(this.scene, this.camera); this.renderer.setRenderTarget(null);
      this.scene.background = bg;
      const buf = new Uint8Array(W * H * 4);
      this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      const counts = new Array(ids.length).fill(0);
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 2] < 250) continue;
        const k = buf[i + 1] - 1;
        if (k >= 0 && k < ids.length) counts[k]++;
      }
      for (const [o, s] of saved) { (o as any).material = s.mat; o.visible = s.vis; }
      return counts;
    };
    const full = read(false), solo = read(true);
    rt.dispose(); black.dispose(); colorMats.forEach((m) => m.dispose());
    const out: Record<string, { full: number; solo: number; visibleFlag: boolean }> = {};
    ids.forEach((id, i) => { out[id] = { full: full[i], solo: solo[i], visibleFlag: this.sim.monsters.find((m) => m.id === id)?.vis.visible ?? false }; });
    return out;
  }
}
