// Loader/cache for pipeline-generated GLB assets (public/assets/gen/*.glb, built by `npm run assets`).
// Every asset is a flat list of named nodes: rig joints for actors, kit pieces (+ socket empties) for the environment.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type GenAssetId = 'vanguard' | 'reaver' | 'envkit';

export interface GenAsset {
  id: GenAssetId;
  /** top-level nodes by name (meshes keep their materials' slot names until bound) */
  nodes: Map<string, THREE.Object3D>;
  extras: Record<string, unknown>;
  tris: number;
}

const cache = new Map<GenAssetId, GenAsset>();
const pending = new Map<GenAssetId, Promise<GenAsset>>();
export const loadLog: { id: string; ms: number; bytes: number; ok: boolean; error?: string }[] = [];

/** `?gen.<id>=<url>` loads an alternative build of an asset (pipeline variants, e.g. a spec override). */
export function assetUrl(id: GenAssetId) {
  const alt = new URLSearchParams(location.search).get('gen.' + id);
  return alt && /^[\w./-]+\.glb$/.test(alt) ? alt : `./assets/gen/${id}.glb`;
}

export function getAsset(id: GenAssetId): GenAsset | null { return cache.get(id) ?? null; }

export function loadAsset(id: GenAssetId): Promise<GenAsset> {
  const hit = cache.get(id); if (hit) return Promise.resolve(hit);
  const p0 = pending.get(id); if (p0) return p0;
  const t0 = performance.now();
  const p = (async () => {
    try {
      const res = await fetch(assetUrl(id));
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${assetUrl(id)}`);
      const buf = await res.arrayBuffer();
      const gltf = await new GLTFLoader().parseAsync(buf, './');
      const nodes = new Map<string, THREE.Object3D>();
      let tris = 0;
      for (const o of [...gltf.scene.children]) nodes.set(o.name, o);
      gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
      const a: GenAsset = { id, nodes, extras: (gltf.scene.userData ?? {}) as Record<string, unknown>, tris: Math.round(tris) };
      cache.set(id, a);
      loadLog.push({ id, ms: Math.round(performance.now() - t0), bytes: buf.byteLength, ok: true });
      return a;
    } catch (e) {
      loadLog.push({ id, ms: Math.round(performance.now() - t0), bytes: 0, ok: false, error: String(e) });
      pending.delete(id);
      throw e;
    }
  })();
  pending.set(id, p);
  return p;
}

/** Deep clone of one node (geometry shared, materials re-bound by the caller). */
export function cloneNode(a: GenAsset, name: string): THREE.Object3D {
  const n = a.nodes.get(name);
  if (!n) throw new Error(`gen asset ${a.id}: missing node "${name}"`);
  const c = n.clone(true);
  c.traverse((o) => { o.userData.sharedGeo = true; });
  return c;
}
