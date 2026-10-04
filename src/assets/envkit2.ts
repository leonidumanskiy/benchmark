// Environment "Outpost kit": instances Blender-generated kit pieces (assetgen/gen_envkit.py) onto the gameplay
// layout. Collision/sight/shots stay defined by the sim obstacles; every visual is fitted to its obstacle footprint.
// One InstancedMesh per (piece, material) keeps draw calls low; lamp sockets in the kit become practical lights.
import * as THREE from 'three';
import type { GenAsset } from './gen/library';
import { genMaterial, genGlow, bindSlots } from './gen/genmat';
import type { Obstacle, Decor, SpawnPoint } from '../sim/arena';
import { LampAnchor, buildGround } from './environment';
import { Rng } from '../sim/rng';
import { CFG } from '../sim/config';
import { pointInShape } from '../sim/math';

const LAMP_COLOR = { red: 0xff2a1a, cyan: 0x39d6ff, amber: 0xffa630 } as const;

let kitMats: Record<string, THREE.Material> | null = null;
export function kitMaterials() {
  if (kitMats) return kitMats;
  const ds = THREE.DoubleSide;
  kitMats = {
    concrete: genMaterial({ color: '#3a3936', roughness: 0.88, metalness: 0, edge: 0.25, edgeColor: '#6e6a63', edgeMetal: 0, edgeRough: 0.8, cavity: 0.6, detail: 0.45, detailRepeat: 0.6 }),
    concreteDark: genMaterial({ color: '#262523', roughness: 0.92, metalness: 0, edge: 0.3, edgeColor: '#4a4741', edgeMetal: 0, edgeRough: 0.85, cavity: 0.6, detail: 0.45, detailRepeat: 0.6 }),
    metal: genMaterial({ color: '#59606a', roughness: 0.5, metalness: 0.6, edge: 0.55, edgeColor: '#aab1ba', cavity: 0.55, detail: 0.15, detailRepeat: 0.8 }),
    metalDark: genMaterial({ color: '#2b3037', roughness: 0.55, metalness: 0.55, edge: 0.45, edgeColor: '#6f7680', cavity: 0.5, detail: 0.15, detailRepeat: 0.8 }),
    rust: genMaterial({ color: '#4a3122', roughness: 0.78, metalness: 0.35, edge: 0.5, edgeColor: '#9a6a48', edgeMetal: 0.5, cavity: 0.6, detail: 0.4, detailRepeat: 0.8 }),
    trim: genMaterial({ color: '#1b1e23', roughness: 0.5, metalness: 0.65, edge: 0.5, edgeColor: '#5a6069', cavity: 0.4 }),
    hazard: genMaterial({ color: '#c08a18', roughness: 0.6, metalness: 0.2, edge: 0.5, edgeColor: '#6b5a40', edgeMetal: 0.6, cavity: 0.4 }),
    hazardDark: genMaterial({ color: '#141414', roughness: 0.7, metalness: 0.2, edge: 0.3, edgeColor: '#3a3a3a', cavity: 0.3 }),
    rebar: genMaterial({ color: '#4a3326', roughness: 0.8, metalness: 0.6, edge: 0 }),
    rock: genMaterial({ color: '#2f2b27', roughness: 0.88, metalness: 0, edge: 0.18, edgeColor: '#5e574e', edgeMetal: 0, edgeRough: 0.75, cavity: 0.7, tint: 0.3, detail: 0.6, detailRepeat: 0.5 }),
    rockDark: genMaterial({ color: '#211e1b', roughness: 0.9, metalness: 0, edge: 0.15, edgeColor: '#46413a', edgeMetal: 0, edgeRough: 0.8, cavity: 0.6, detail: 0.6, detailRepeat: 0.5 }),
    moss: genMaterial({ color: '#18200f', roughness: 1, metalness: 0, edge: 0, cavity: 0.3, detail: 0.6, detailRepeat: 2 }),
    leafRed: genMaterial({ color: '#7c1426', roughness: 0.55, metalness: 0, emissive: '#2a0008', emissiveIntensity: 0.6, edge: 0, side: ds, cavity: 0.2 }),
    leafDark: genMaterial({ color: '#1f2a1c', roughness: 0.7, metalness: 0, edge: 0.2, edgeColor: '#6a1a22', edgeMetal: 0, side: ds }),
    leafTeal: genMaterial({ color: '#174242', roughness: 0.55, metalness: 0, emissive: '#03211f', emissiveIntensity: 0.6, edge: 0, side: ds }),
    grass: genMaterial({ color: '#3a4529', roughness: 0.85, metalness: 0, edge: 0, side: ds }),
    stalk: genMaterial({ color: '#33231f', roughness: 0.7, metalness: 0, edge: 0 }),
    bulb: genGlow(0x5af0ff, 2.4),
    bulbPink: genGlow(0xff4fa0, 2.4),
    shroomCap: genMaterial({ color: '#21414f', roughness: 0.45, metalness: 0, emissive: '#18c8ff', emissiveIntensity: 0.5, edge: 0 }),
    hive: genMaterial({ color: '#1c0a11', roughness: 0.42, metalness: 0.05, emissive: '#30040e', emissiveIntensity: 0.4, edge: 0.2, edgeColor: '#5a1424', edgeMetal: 0, cavity: 0.5 }),
    hiveGlow: genGlow(0xff3048, 2.4),
    lampRed: genGlow(LAMP_COLOR.red, 3.6),
    lampCyan: genGlow(LAMP_COLOR.cyan, 3.0),
    lampAmber: genGlow(LAMP_COLOR.amber, 3.0),
    screen: genGlow(0x2fe0c0, 1.6),
    cable: genMaterial({ color: '#111216', roughness: 0.55, metalness: 0.1, edge: 0 }),
    decal: genMaterial({ color: '#cfc8b8', roughness: 0.6, metalness: 0, edge: 0 }),
    puddle: new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.06, metalness: 0.0, envMapIntensity: 6, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  return kitMats;
}

interface Placement { piece: string; m: THREE.Matrix4 }

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mat = (pos: THREE.Vector3, rotY: number, scl: THREE.Vector3 | number = 1, tilt?: THREE.Euler) => {
  const q = new THREE.Quaternion().setFromEuler(tilt ?? new THREE.Euler(0, rotY, 0));
  if (tilt) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY));
  return new THREE.Matrix4().compose(pos, q, typeof scl === 'number' ? v3(scl, scl, scl) : scl);
};

function noise1(seed: number) {
  const r = new Rng(seed);
  const a = [r.next() * 6, r.next() * 6, r.next() * 6], f = [0.7 + r.next(), 1.9 + r.next() * 2, 4 + r.next() * 3];
  return (u: number) => (Math.sin(u * f[0] + a[0]) * 0.5 + Math.sin(u * f[1] + a[1]) * 0.3 + Math.sin(u * f[2] + a[2]) * 0.2) * 0.5 + 0.5;
}

/** Placements for one gameplay obstacle (the visual footprint matches the collision shape). */
export function placeObstacle(ob: Obstacle, out: Placement[]) {
  const s = ob.shape;
  const rng = new Rng(ob.seed * 7919 + 13);
  if (s.kind === 'box') {
    const alongX = s.hw >= s.hd;
    const L = 2 * Math.max(s.hw, s.hd), D = 2 * Math.min(s.hw, s.hd), H = ob.height;
    const rot = alongX ? 0 : Math.PI / 2;
    // local (u along the long axis) -> world
    const at = (u: number, y = 0, w = 0) => alongX ? v3(s.cx + u, y, s.cz + w) : v3(s.cx - w, y, s.cz + u);
    if (ob.kind === 'wall') {
      const perimeter = ob.id.startsWith('wall_');
      const n = Math.max(1, Math.round(L));
      const sx = L / n, prof = noise1(ob.seed);
      for (let i = 0; i < n; i++) {
        const u = -L / 2 + (i + 0.5) * sx;
        const p = prof(u / 2.2);
        const piece = p > 0.78 ? 'wall_A' : p > 0.58 ? 'wall_D' : p > 0.38 ? 'wall_B' : 'wall_C';
        const flip = (ob.seed + i) % 2 ? Math.PI : 0; // modules are symmetric in depth; alternating only varies the damage
        out.push({ piece, m: mat(at(u), rot + flip, v3(sx, H / 2.5, D / 0.8)) });
      }
      if (perimeter) {
        for (let u = -L / 2 + 1.6; u < L / 2 - 1; u += 4.2) out.push({ piece: 'wall_post', m: mat(at(u), rot, v3(1, H / 2.5, D / 0.8)) });
        for (const e of [-1, 1]) out.push({ piece: 'wall_post', m: mat(at(e * (L / 2 - 0.2)), rot, v3(1, H / 2.5, D / 0.8)) });
      }
      // rubble / reeds dressing along the foot
      for (let i = 0; i < Math.ceil(L * 0.8); i++) {
        const u = (rng.next() - 0.5) * L, side = rng.next() < 0.5 ? -1 : 1;
        out.push({ piece: rng.next() < 0.6 ? 'rubble' : 'reeds', m: mat(at(u, 0, side * (D / 2 + 0.35 + rng.next() * 0.4)), rng.next() * 6, 0.7 + rng.next() * 0.6) });
      }
    } else if (ob.kind === 'cover') {
      const inner = L - 0.4;
      const n = Math.max(1, Math.round(inner)), sx = inner / n;
      for (let i = 0; i < n; i++) out.push({ piece: 'cover_mid', m: mat(at(-inner / 2 + (i + 0.5) * sx), rot, v3(sx, H / 1.15, D / 0.9)) });
      for (const e of [-1, 1]) out.push({ piece: 'cover_end', m: mat(at(e * (L / 2 - 0.1)), rot + (e < 0 ? Math.PI : 0), v3(1, H / 1.15, D / 0.9)) });
    } else if (ob.kind === 'lair') {
      const inner = L - 0.6;
      const n = Math.max(1, Math.round(inner)), sx = inner / n;
      for (let i = 0; i < n; i++) out.push({ piece: 'lair_mid', m: mat(at(-inner / 2 + (i + 0.5) * sx), rot, v3(sx, H / 1.4, D / 1.0)) });
      for (const e of [-1, 1]) out.push({ piece: 'lair_end', m: mat(at(e * (L / 2 - 0.15)), rot, v3(1, H / 1.4, D / 0.3 * 0.3)) });
    } else if (ob.kind === 'crate') {
      out.push({ piece: ob.seed % 2 ? 'crate_B' : 'crate_A', m: mat(v3(s.cx, 0, s.cz), (ob.seed % 4) * Math.PI / 2, v3(2 * s.hw, H, 2 * s.hd)) });
      if (rng.next() < 0.7) out.push({ piece: 'crate_small', m: mat(v3(s.cx + s.hw + 0.35, 0, s.cz + (rng.next() - 0.5) * s.hd), rng.next() * 6) });
    }
  } else {
    const r = s.r, H = ob.height;
    if (ob.kind === 'rock') {
      out.push({ piece: 'rock_' + 'ABCD'[ob.seed % 4], m: mat(v3(s.cx, 0, s.cz), rng.next() * 6, v3(r * 1.02, H / 1.1, r * 1.02)) });
      for (let i = 0; i < 3; i++) {
        const a = rng.next() * Math.PI * 2;
        out.push({ piece: 'stone_' + 'ABC'[i], m: mat(v3(s.cx + Math.cos(a) * (r + 0.25), 0, s.cz + Math.sin(a) * (r + 0.25)), rng.next() * 6, 0.35 + rng.next() * 0.3) });
      }
    } else if (ob.kind === 'pillar') {
      out.push({ piece: 'pillar', m: mat(v3(s.cx, 0, s.cz), rng.next() * 6, v3(r / 0.55, H / 3.0, r / 0.55)) });
    }
  }
}

export function placeDecor(decor: Decor[], spawns: SpawnPoint[], obstacles: Obstacle[], out: Placement[]) {
  for (const d of decor) {
    const at = v3(d.x, 0, d.z), sc = d.scale;
    if (d.kind === 'flora') out.push({ piece: ['fern_red', 'bulb_plant', 'spiky_dark', 'reeds'][d.seed % 4], m: mat(at, d.rot, sc) });
    else if (d.kind === 'shroom') out.push({ piece: 'shrooms', m: mat(at, d.rot, sc) });
    else if (d.kind === 'grass') out.push({ piece: 'grass_tuft', m: mat(at, d.rot, v3(sc, sc * (0.7 + (d.seed % 7) / 10), sc)) });
    else if (d.kind === 'debris') out.push({ piece: ['debris_panel', 'debris_pipe', 'rubble', 'cables', 'crate_small', 'barrel'][d.seed % 6], m: mat(at, d.rot, d.seed % 6 === 5 ? 1 : sc) });
    else if (d.kind === 'pebble') out.push({ piece: 'stone_' + 'ABC'[d.seed % 3], m: mat(at, d.rot, 0.1 + (d.seed % 10) / 50) });
  }
  // alien hive growth around every lair spawn
  for (const sp of spawns) {
    const rng = new Rng(Math.round(sp.x * 100 + sp.z));
    for (let i = 0; i < 2; i++) out.push({ piece: 'hive', m: mat(v3(sp.x + (rng.next() - 0.5) * 2, 0, sp.z + (rng.next() - 0.5) * 2), rng.next() * 6, 0.9 + rng.next() * 0.5) });
  }
  // clutter clusters against obstacle faces (non-blocking dressing; collision stays the sim's)
  const crng = new Rng(9090);
  const props = ['console', 'vent_unit', 'barrel', 'crate_small', 'lamp_post', 'floor_cable', 'railing'];
  for (const ob of obstacles) {
    if (ob.kind !== 'cover' && ob.kind !== 'wall' && ob.kind !== 'crate') continue;
    const s = ob.shape; if (s.kind !== 'box') continue;
    const k = ob.kind === 'wall' ? 2 : 1;
    for (let i = 0; i < k; i++) {
      const alongX = s.hw >= s.hd;
      const side = crng.next() < 0.5 ? -1 : 1;
      const u = (crng.next() - 0.5) * 2 * Math.max(s.hw, s.hd) * 0.8;
      const off = Math.min(s.hw, s.hd) + 0.55;
      const x = alongX ? s.cx + u : s.cx + side * off, z = alongX ? s.cz + side * off : s.cz + u;
      if (Math.abs(x) > CFG.arenaHalf - 0.6 || Math.abs(z) > CFG.arenaHalf - 0.6) continue;
      if (obstacles.some((o) => o !== ob && pointInShape(x, z, o.shape, 0.5))) continue;
      const piece = props[Math.floor(crng.next() * props.length)];
      const face = alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      out.push({ piece, m: mat(v3(x, 0, z), piece === 'railing' || piece === 'floor_cable' ? (alongX ? 0 : Math.PI / 2) : face + (crng.next() - 0.5) * 0.3, piece === 'railing' ? 0.9 : 1) });
    }
  }
  // wet ground: puddles in open floor
  const rng = new Rng(4711);
  let n = 0, tries = 0;
  while (n < 16 && tries++ < 500) {
    const x = (rng.next() * 2 - 1) * (CFG.arenaHalf - 1.5), z = (rng.next() * 2 - 1) * (CFG.arenaHalf - 1.5);
    if (obstacles.some((o) => pointInShape(x, z, o.shape, 1.2))) continue;
    out.push({ piece: 'puddle', m: mat(v3(x, 0, z), rng.next() * 6, v3(0.6 + rng.next() * 1.3, 1, 0.5 + rng.next() * 0.9)) }); n++;
  }
}

export function placeBackdrop(out: Placement[]) {
  const rng = new Rng(4242);
  const R = CFG.navHalf;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rng.next() * 0.05;
    const d = R + 1.5 + rng.next() * 4;
    const x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 1.05;
    if (Math.max(Math.abs(x), Math.abs(z)) < R + 0.8) continue;
    const r = 1.2 + rng.next() * 2.2;
    out.push({ piece: 'rock_' + 'ABCD'[i % 4], m: mat(v3(x, -0.2, z), rng.next() * 6, v3(r, r * (0.7 + rng.next() * 0.9), r)) });
    if (i % 3 === 0) out.push({ piece: ['fern_red', 'spiky_dark', 'reeds'][i % 9 / 3 | 0], m: mat(v3(x * 0.96, 0, z * 0.96), rng.next() * 6, 1.4) });
  }
  const blocks: [number, number, number, number, number][] = [[-22, -22, 5, 4, 6], [22, -21, 4, 6, 5], [21, 22, 6, 3.5, 4], [-22, 21, 4, 5, 6]];
  blocks.forEach(([x, z, w, h, d], i) => {
    out.push({ piece: 'bd_block', m: mat(v3(x, 0, z), 0, v3(w, h, d)) });
    out.push({ piece: i % 2 ? 'bd_tank' : 'bd_tower', m: mat(v3(x + w * 0.35, h, z - d * 0.15), i, i % 2 ? v3(1.1, 1.2, 1.1) : v3(0.8, 0.55, 0.8)) });
  });
  for (const zz of [-1, 1]) for (let x = -18; x <= 18; x += 4) out.push({ piece: 'bd_pipe', m: mat(v3(x, 0, zz * (R + 0.9)), 0, 1) });
}

export function buildEnvKit2(asset: GenAsset, obstacles: Obstacle[], decor: Decor[], spawns: SpawnPoint[], lamps: LampAnchor[]): THREE.Group {
  const grp = new THREE.Group(); grp.name = 'envkit2';
  const ground = buildGround();
  const gm = (ground.getObjectByName('ground') as THREE.Mesh).material as THREE.MeshStandardMaterial;
  gm.color.set(0x8a8f96); gm.roughness = 0.62; gm.envMapIntensity = 2.0;
  grp.add(ground);

  const P: Placement[] = [];
  for (const ob of obstacles) placeObstacle(ob, P);
  placeDecor(decor, spawns, obstacles, P);
  placeBackdrop(P);

  const byPiece = new Map<string, THREE.Matrix4[]>();
  for (const p of P) { if (!byPiece.has(p.piece)) byPiece.set(p.piece, []); byPiece.get(p.piece)!.push(p.m); }
  const mats = kitMaterials();
  const noShadow = new Set(['grass_tuft', 'puddle', 'stone_A', 'stone_B', 'stone_C', 'shrooms']);
  for (const [piece, ms] of byPiece) {
    const node = asset.nodes.get(piece);
    if (!node) throw new Error(`envkit: missing piece ${piece}`);
    const src = node.clone(true);
    bindSlots(src, mats);
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.isMesh) {
        const im = new THREE.InstancedMesh(me.geometry, me.material, ms.length);
        const local = me.matrixWorld; // relative to the piece origin (node at identity)
        ms.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(local)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.castShadow = !noShadow.has(piece); im.receiveShadow = true;
        im.name = `${piece}:${(me.material as THREE.Material).name}`;
        im.userData.sharedGeo = true; im.userData.piece = piece;
        grp.add(im);
      } else if (o.userData.lamp) {
        const kind = o.userData.lamp as LampAnchor['kind'];
        const lp = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
        for (const m of ms) lamps.push({ pos: lp.clone().applyMatrix4(m), color: LAMP_COLOR[kind], kind });
      }
    });
  }
  grp.userData.placements = P.length;
  grp.userData.pieces = byPiece.size;
  return grp;
}
