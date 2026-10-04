// HD asset runtime: loads the Blender-built GLBs (public/assets/hd/*.glb, see assets-src/) and dresses the existing
// procedural rigs with them. Every GLB mesh is named after the rig joint it rides on (`joint` or `joint__variant`) and is
// modelled in that joint's local frame, so all procedural animation / IK / gameplay code keeps working unchanged.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import playerSpec from '../../../assets-src/specs/player.json';
import monsterSpec from '../../../assets-src/specs/monster.json';
import envSpec from '../../../assets-src/specs/envkit.json';

export type HdKind = 'player' | 'monster' | 'envkit' | 'floor';
export const HD_SPECS = { player: playerSpec, monster: monsterSpec, envkit: envSpec, floor: envSpec } as Record<HdKind, { name: string; slots: Record<string, { color: string; emissive?: number }> }>;

export interface HdAsset {
  kind: HdKind;
  /** mesh templates by node name */
  parts: Map<string, THREE.Mesh>;
  /** shared materials by slot name */
  mats: Map<string, THREE.MeshStandardMaterial>;
  tris: number;
}

const cache = new Map<HdKind, Promise<HdAsset>>();
const ready = new Map<HdKind, HdAsset>();
const loader = new GLTFLoader();

export function hdUrl(kind: HdKind) { return `${import.meta.env.BASE_URL}assets/hd/${kind}.glb`; }

export function loadHd(kind: HdKind): Promise<HdAsset> {
  let p = cache.get(kind);
  if (!p) {
    p = loader.loadAsync(hdUrl(kind)).then((gltf) => {
      const spec = HD_SPECS[kind];
      const parts = new Map<string, THREE.Mesh>();
      const mats = new Map<string, THREE.MeshStandardMaterial>();
      let tris = 0;
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // multi-material nodes come in as a Group of primitives: merge children under the node name
        const name = (m.parent && m.parent !== gltf.scene && !(m.parent as THREE.Mesh).isMesh ? m.parent.name : m.name).replace(/\.\d+$/, '');
        const list = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of list as THREE.MeshStandardMaterial[]) {
          const slot = mat.name.startsWith(spec.name + '_') ? mat.name.slice(spec.name.length + 1) : mat.name;
          mat.userData.slot = slot;
          tuneMaterial(mat, spec.slots[slot]);
          if (!mats.has(slot)) mats.set(slot, mat);
        }
        m.updateMatrix();
        const g = m.geometry;
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        const prev = parts.get(name);
        if (prev) prev.add(m.clone()); // extra primitive of the same node
        else { const c = m.clone(); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1); c.name = name; parts.set(name, c); }
      });
      const asset: HdAsset = { kind, parts, mats, tris: Math.round(tris) };
      ready.set(kind, asset);
      return asset;
    });
    cache.set(kind, p);
  }
  return p;
}

export function hdReady(kind: HdKind) { return ready.get(kind) ?? null; }

/** Game-side material tuning (the bake carries albedo/ORM/normal; these keep the HD set consistent with the scene's light rig). */
function tuneMaterial(mat: THREE.MeshStandardMaterial, slot?: { color: string; emissive?: number }) {
  mat.roughness = 1; mat.metalness = 1; // factors x baked ORM
  mat.envMapIntensity = 0.6;
  if (slot?.emissive) { mat.emissive = new THREE.Color(slot.color); mat.emissiveIntensity = slot.emissive; }
  if (mat.aoMap) mat.aoMapIntensity = 0.6;
  mat.userData.baseColor = mat.color.clone();
  mat.userData.baseEmissive = mat.emissive.clone();
}

/**
 * Attach HD parts to rig joints. `joints` maps node base names to joints; `variant(tag)` decides which tagged
 * equipment parts are shown. `cloneMats` gives the instance private materials (per-instance flashes / glow fades).
 */
export function dressRig(asset: HdAsset, joints: Record<string, THREE.Object3D>, opts: { variant?: (tag: string) => boolean; cloneMats?: boolean; userData?: Record<string, unknown> } = {}) {
  const matMap = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const getMat = (m: THREE.Material) => {
    if (!opts.cloneMats) return m;
    let c = matMap.get(m);
    if (!c) { c = (m as THREE.MeshStandardMaterial).clone(); c.userData = { ...m.userData, baseColor: (m as THREE.MeshStandardMaterial).color.clone(), baseEmissive: (m as THREE.MeshStandardMaterial).emissive.clone() }; matMap.set(m, c); }
    return c;
  };
  const meshes: THREE.Mesh[] = [];
  const missing: string[] = [];
  for (const [name, tpl] of asset.parts) {
    const [base, tag] = name.split('__');
    const j = joints[base];
    if (!j) { missing.push(name); continue; }
    if (tag && opts.variant && !opts.variant(tag)) continue;
    const mesh = tpl.clone(true);
    mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map(getMat) : getMat(m.material);
      m.castShadow = true; m.receiveShadow = true;
      Object.assign(m.userData, opts.userData ?? {}, { hd: true });
      meshes.push(m);
    });
    j.add(mesh);
  }
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  for (const m of meshes) for (const mm of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) mats.set(mm.userData.slot, mm);
  return { meshes, mats, missing };
}

/** Runtime palette override on HD materials: tint = new / baked colour (keeps wear, AO and decals of the bake). */
export function applyPalette(mats: Map<string, THREE.MeshStandardMaterial>, kind: HdKind, palette: Record<string, string> | undefined) {
  if (!palette) return;
  const spec = HD_SPECS[kind];
  for (const [slot, hex] of Object.entries(palette)) {
    const m = mats.get(slot); const base = spec.slots[slot];
    if (!m || !base) continue;
    const want = new THREE.Color(hex), was = new THREE.Color(base.color);
    if (base.emissive) { m.emissive.copy(want); m.userData.baseEmissive = want.clone(); continue; }
    m.color.setRGB(want.r / Math.max(was.r, 0.02), want.g / Math.max(was.g, 0.02), want.b / Math.max(was.b, 0.02));
    m.userData.baseColor = m.color.clone();
  }
}
