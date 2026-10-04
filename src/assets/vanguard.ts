// Player "Vanguard": the Blender-generated trooper (assetgen/gen_vanguard.py) mounted on the same joint rig and
// IK solvers as the classic player, so PlayerView animates it unchanged. Skeleton + palette come from the shared spec.
import * as THREE from 'three';
import { joint, solveTwoBone } from './kit';
import type { PlayerRig, PlayerSpec } from './player';
import { PLAYER_SPEC } from './player';
import { GenAsset, cloneNode } from './gen/library';
import { genMaterial, genGlow, bindSlots } from './gen/genmat';
import VANGUARD_JSON from '../../assetgen/specs/vanguard.json';

export type VanguardSpec = typeof VANGUARD_JSON;
export const VANGUARD_SPEC: VanguardSpec = VANGUARD_JSON;

export function vanguardMaterials(p: VanguardSpec['palette']) {
  return {
    armor: genMaterial({ color: p.armor, roughness: 0.48, metalness: 0.45, edge: 0.5, edgeColor: '#9aa1ab', detail: 0.12 }),
    armorDark: genMaterial({ color: p.armorDark, roughness: 0.55, metalness: 0.4, edge: 0.4, edgeColor: '#5c626b', detail: 0.1 }),
    accent: genMaterial({ color: p.accent, roughness: 0.42, metalness: 0.2, edge: 0.45, edgeColor: '#e0503c', edgeMetal: 0.4, detail: 0.08 }),
    suit: genMaterial({ color: p.suit, roughness: 0.88, metalness: 0.05, edge: 0.1, edgeColor: '#33363d', detail: 0.25, detailRepeat: 2 }),
    webbing: genMaterial({ color: p.webbing, roughness: 0.92, metalness: 0.0, edge: 0.15, edgeColor: '#4d463b', detail: 0.3, detailRepeat: 3 }),
    metal: genMaterial({ color: p.metal, roughness: 0.32, metalness: 0.9, edge: 0.3, edgeColor: '#d8dde4' }),
    gun: genMaterial({ color: p.gun, roughness: 0.42, metalness: 0.65, edge: 0.5, edgeColor: '#7d838c', detail: 0.08 }),
    gunDark: genMaterial({ color: p.gunDark, roughness: 0.48, metalness: 0.55, edge: 0.4, edgeColor: '#4d535c' }),
    rubber: genMaterial({ color: p.rubber, roughness: 0.92, metalness: 0.0, edge: 0.1, edgeColor: '#2a2d33' }),
    decal: genMaterial({ color: p.decal, roughness: 0.6, metalness: 0.0, edge: 0 }),
    visor: genGlow(p.visor, 2.3),
    lights: genGlow(p.lights, 3.4),
    lens: genGlow(p.lens, 2.6),
  };
}

const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'upperL', 'foreL', 'handL', 'upperR', 'foreR', 'handR'];

export function buildVanguard(asset: GenAsset, spec: VanguardSpec = VANGUARD_SPEC): PlayerRig {
  const S = spec.skeleton;
  const mats = vanguardMaterials(spec.palette);
  const root = new THREE.Group(); root.name = 'player';
  const model = joint('model', root); model.rotation.y = Math.PI / 2; // +Z (model) -> +X (sim facing)
  const j: Record<string, THREE.Group> = {};
  j.hips = joint('hips', model, [0, S.hipY, 0]);
  j.spine = joint('spine', j.hips, [0, S.spineY, 0]);
  j.chest = joint('chest', j.spine, [0, S.chestY, 0]);
  j.neck = joint('neck', j.chest, [0, S.neckY, 0]);
  j.head = joint('head', j.neck, [0, S.headY, S.headZ]);
  for (const [s, x] of [['L', 1], ['R', -1]] as const) {
    j['thigh' + s] = joint('thigh' + s, j.hips, [S.hipX * x, -0.04, 0]);
    j['shin' + s] = joint('shin' + s, j['thigh' + s], [0, -S.thigh, 0]);
    j['foot' + s] = joint('foot' + s, j['shin' + s], [0, -S.shin, 0]);
    j['upper' + s] = joint('upper' + s, j.chest, [S.shoulderX * x, S.shoulderY, -0.01]);
    j['fore' + s] = joint('fore' + s, j['upper' + s], [0, -S.upper, 0]);
    j['hand' + s] = joint('hand' + s, j['fore' + s], [0, -S.lower, 0]);
  }
  j.chest.rotation.y = S.stanceYaw; j.neck.rotation.y = -S.stanceYaw * 0.8;
  const gun = joint('gun', j.spine, S.gun as [number, number, number]);
  const muzzle = joint('muzzle', gun, S.muzzle as [number, number, number]);
  const gripR = joint('gripR', gun, S.gripR as [number, number, number]);
  const gripL = joint('gripL', gun, S.gripL as [number, number, number]);

  for (const name of JOINTS) { const n = cloneNode(asset, name); j[name].add(n); }
  gun.add(cloneNode(asset, 'gun'));
  bindSlots(root, mats as unknown as Record<string, THREE.Material>);

  const { upper, lower, thigh, shin, hipY } = S;
  const tmp = new THREE.Vector3();
  const rig: PlayerRig = {
    root, model, j, gun, muzzle, gripR, gripL,
    spec: PLAYER_SPEC as PlayerSpec,
    dims: { upper, lower, thigh, shin, hipY, stanceYaw: S.stanceYaw },
    solveArms() {
      root.updateMatrixWorld(true);
      for (const [s, grip, x] of [['L', gripL, 1], ['R', gripR, -1]] as const) {
        const t = j.chest.worldToLocal(grip.getWorldPosition(tmp.set(0, 0, 0)));
        solveTwoBone(j['upper' + s], j['fore' + s], upper, lower, t.clone(), new THREE.Vector3(0.7 * x, -0.6, -0.2));
        j['hand' + s].quaternion.identity();
      }
    },
    solveLegs(footL: THREE.Vector3, footR: THREE.Vector3) {
      root.updateMatrixWorld(true);
      for (const [s, f] of [['L', footL], ['R', footR]] as const) {
        const t = j.hips.worldToLocal(model.localToWorld(f.clone()));
        solveTwoBone(j['thigh' + s], j['shin' + s], thigh, shin, t, new THREE.Vector3(j['thigh' + s].position.x, -0.4, 1.0));
        const qs = new THREE.Quaternion(); j['shin' + s].getWorldQuaternion(qs);
        const qm = new THREE.Quaternion(); model.getWorldQuaternion(qm);
        j['foot' + s].quaternion.copy(qs.invert().multiply(qm));
      }
    },
  };
  rig.solveLegs(new THREE.Vector3(0.13, 0.09, 0.02), new THREE.Vector3(-0.13, 0.09, -0.04));
  rig.solveArms();
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.part = 'player'; });
  (rig as any).variant = 'vanguard';
  return rig;
}
