// HD environment: fits the Blender-built kit modules (public/assets/hd/envkit.glb) onto the gameplay obstacle footprints,
// adds lamp fixtures at the practical-light anchors and lays the baked tileable deck floor. Visual only: collision,
// sight lines and shots still come from the sim's obstacle shapes, which every module is scaled to.
import * as THREE from 'three';
import type { HdAsset } from './hd';
import type { Obstacle, SpawnPoint } from '../../sim/arena';
import type { LampAnchor } from '../environment';
import { Rng } from '../../sim/rng';
import { CFG } from '../../sim/config';
import envSpec from '../../../assets-src/specs/envkit.json';
import { noiseTile } from '../textures';

const NOM = envSpec.modules as unknown as Record<string, [number, number, number]>;

export interface EnvHdStats { modules: number; lamps: number; byKind: Record<string, number> }

export function buildEnvironmentHd(kit: HdAsset, floor: HdAsset | null, obstacles: Obstacle[], spawns: SpawnPoint[], lamps: LampAnchor[]): THREE.Group {
  const root = new THREE.Group(); root.name = 'envHd';
  const stats: EnvHdStats = { modules: 0, lamps: 0, byKind: {} };
  const put = (parent: THREE.Object3D, name: string, pos: [number, number, number], rotY = 0, scl: [number, number, number] = [1, 1, 1], tag?: string) => {
    const tpl = kit.parts.get(name);
    if (!tpl) throw new Error('envkit: missing module ' + name);
    const m = tpl.clone(true);
    m.position.set(...pos); m.rotation.set(0, rotY, 0); m.scale.set(...scl);
    m.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.receiveShadow = true; me.userData.hd = true; } });
    if (tag) m.userData.obstacle = tag;
    parent.add(m);
    stats.modules++; stats.byKind[name] = (stats.byKind[name] ?? 0) + 1;
    return m;
  };

  for (const ob of obstacles) {
    const g = new THREE.Group(); g.name = ob.id; g.userData.obstacle = ob.id;
    const rng = new Rng(ob.seed * 977 + 5);
    const s = ob.shape;
    g.position.set(s.cx, 0, s.cz);
    if (s.kind === 'box') {
      const alongX = s.hw >= s.hd;
      const L = 2 * Math.max(s.hw, s.hd), D = 2 * Math.min(s.hw, s.hd), H = ob.height;
      const frame = new THREE.Group(); frame.rotation.y = alongX ? 0 : Math.PI / 2; g.add(frame);
      const tile = (name: string, nominal: [number, number, number], pick?: (i: number) => string) => {
        const n = Math.max(1, Math.round(L / nominal[0]));
        const sx = L / (n * nominal[0]), sy = H / nominal[1], sz = D / nominal[2];
        for (let i = 0; i < n; i++) {
          const flip = rng.next() < 0.5 ? Math.PI : 0; // modules are two-faced: random flip breaks repetition
          put(frame, pick ? pick(i) : name, [-L / 2 + (i + 0.5) * (L / n), 0, 0], flip, [sx, sy, sz]);
        }
        return { n, sx, sy, sz };
      };
      if (ob.kind === 'wall') {
        const perimeter = ob.id.startsWith('wall_');
        tile('wall_a', NOM.wall, (i) => {
          const r = rng.next();
          if (!perimeter) return r < 0.6 ? 'wall_c' : 'wall_a';
          return r < 0.15 ? 'wall_c' : (i % 2 ? 'wall_b' : 'wall_a');
        });
      } else if (ob.kind === 'cover') {
        const t = tile('barricade', NOM.barricade);
        for (const e of [-1, 1]) put(frame, 'barricade_end', [e * (L / 2 - 0.02), 0, 0], e < 0 ? Math.PI : 0, [1, t.sy, t.sz]);
      } else if (ob.kind === 'lair') {
        tile('gate', NOM.gate);
      } else if (ob.kind === 'crate') {
        put(g, rng.next() < 0.5 ? 'crate_a' : 'crate_b', [0, 0, 0], Math.floor(rng.next() * 4) * (Math.PI / 2), [(2 * s.hw) / NOM.crate[0], H / NOM.crate[1], (2 * s.hd) / NOM.crate[2]]);
        // a barrel next to some crates (non-blocking dressing, kept inside the crate's shadow area)
      }
    } else if (ob.kind === 'rock') {
      const name = rng.next() < 0.5 ? 'rock_a' : 'rock_b';
      const bb = bbox(kit, name);
      const rx = (s.r * 2.1) / (bb.max.x - bb.min.x), rz = (s.r * 2.1) / (bb.max.z - bb.min.z);
      put(g, name, [0, -0.05, 0], rng.next() * Math.PI * 2, [rx, (ob.height + 0.05) / bb.max.y, rz]);
      // satellite boulders
      const nSat = 2 + Math.floor(rng.next() * 2);
      for (let i = 0; i < nSat; i++) {
        const a = rng.next() * Math.PI * 2, sc = s.r * (0.18 + rng.next() * 0.14);
        put(g, rng.next() < 0.5 ? 'rock_a' : 'rock_b', [Math.cos(a) * s.r * 1.0, -0.03, Math.sin(a) * s.r * 1.0], rng.next() * 6, [sc, sc * 0.8, sc]);
      }
    } else if (ob.kind === 'pillar') {
      put(g, 'pylon', [0, 0, 0], Math.PI / 8, [s.r / 0.5, ob.height / NOM.pylon[1], s.r / 0.5]);
    }
    root.add(g);
  }

  // lamp fixtures on the red practical-light anchors (perimeter pilasters, lair gates) so emitters and lights coincide
  for (const l of lamps) {
    if (l.kind !== 'red') continue;
    const hit = nearestBoxFace(obstacles, l.pos.x, l.pos.z, l.pos.y);
    if (!hit) continue;
    const name = 'lamp_red';
    put(root, name, [hit.x, hit.y, hit.z], hit.rotY);
    stats.lamps++;
  }

  // dressing: a few barrels by the lairs (monster spawn approach) — outside every footprint, never blocking
  for (const sp of spawns) {
    const rng = new Rng(Math.round(sp.x * 31 + sp.z * 17));
    const ox = Math.sign(sp.x) * 0.0 + (Math.abs(sp.x) > Math.abs(sp.z) ? 0 : 1.6), oz = Math.abs(sp.x) > Math.abs(sp.z) ? 1.6 : 0;
    if (rng.next() < 0.6) put(root, 'barrel', [sp.x + ox * (rng.next() < 0.5 ? 1 : -1), 0, sp.z + oz * (rng.next() < 0.5 ? 1 : -1)], rng.next() * 6);
  }

  if (floor) root.add(buildFloor(floor));
  root.userData.stats = stats;
  return root;
}

function bbox(kit: HdAsset, name: string) {
  const m = kit.parts.get(name)!;
  if (!m.userData.bbox) m.userData.bbox = new THREE.Box3().setFromObject(m);
  return m.userData.bbox as THREE.Box3;
}

/** snap a lamp anchor onto the nearest box obstacle face (or its top), facing outwards */
function nearestBoxFace(obstacles: Obstacle[], x: number, z: number, y: number) {
  let best: { x: number; y: number; z: number; rotY: number; d: number } | null = null;
  for (const ob of obstacles) {
    const s = ob.shape;
    if (s.kind !== 'box') continue;
    const dx = x - s.cx, dz = z - s.cz;
    const inside = Math.abs(dx) <= s.hw && Math.abs(dz) <= s.hd;
    if (inside && y >= ob.height - 0.05) { // anchor above the top (lair lamps): sit on top
      const d = 0;
      if (!best || d < best.d) best = { x, y: ob.height + 0.07, z, rotY: 0, d };
      continue;
    }
    const cx = Math.max(-s.hw, Math.min(s.hw, dx)), cz = Math.max(-s.hd, Math.min(s.hd, dz));
    const d = Math.hypot(dx - cx, dz - cz);
    if (d > 0.6 || (best && d >= best.d)) continue;
    const onX = Math.abs(dx - cx) > Math.abs(dz - cz);
    const nx = onX ? Math.sign(dx) : 0, nz = onX ? 0 : Math.sign(dz);
    best = { x: s.cx + cx + nx * 0.05, y: Math.min(y, ob.height - 0.3), z: s.cz + cz + nz * 0.05, rotY: Math.atan2(nx, nz), d };
  }
  return best;
}

/** Baked tileable deck floor repeated over the arena + lair approaches. */
function buildFloor(floor: HdAsset): THREE.Mesh {
  const tpl = [...floor.parts.values()][0];
  const src = (Array.isArray(tpl.material) ? tpl.material[0] : tpl.material) as THREE.MeshStandardMaterial;
  const extent = envSpec.floor.extent;
  const size = CFG.navHalf * 2 + 6;
  const mat = src.clone();
  const rep = size / extent;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
    const t = mat[key];
    if (!t) continue;
    const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(rep, rep); c.anisotropy = 8; c.needsUpdate = true;
    mat[key] = c;
  }
  mat.roughness = 1; mat.metalness = 1; mat.envMapIntensity = 0.6;
  mat.color.setScalar(0.85);
  addMacroLayer(mat);
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.002; m.receiveShadow = true; m.name = 'floorHd'; m.userData.hd = true;
  return m;
}

/** World-space macro variation over the repeating tile: large grime fields and wet puddles (dark, mirror-like). */
function addMacroLayer(mat: THREE.MeshStandardMaterial) {
  const macro = new THREE.CanvasTexture(noiseTile(256, 91, 5));
  macro.wrapS = macro.wrapT = THREE.RepeatWrapping; macro.colorSpace = THREE.NoColorSpace;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: macro };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMacroW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMacroW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMacroW;\nuniform sampler2D uMacro;\nfloat macroGrime; float macroWet;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mA = texture2D(uMacro, vMacroW.xz / 21.0).r, mB = texture2D(uMacro, vMacroW.xz / 6.7 + 0.37).r, mC = texture2D(uMacro, vMacroW.xz / 2.3 + 0.71).r;
        macroGrime = smoothstep(0.38, 0.78, mA * 0.65 + mB * 0.35);
        macroWet = smoothstep(0.6, 0.66, mA * 0.5 + mB * 0.35 + mC * 0.15);
        diffuseColor.rgb *= mix(1.0, 0.42, macroGrime) * mix(1.0, 0.55, macroWet);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, macroWet);');
  };
  mat.customProgramCacheKey = () => 'floorHdMacro';
}
