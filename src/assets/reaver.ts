// Monster "Reaver": Blender-generated biomechanical hexapod (assetgen/gen_reaver.py) on the classic monster joint
// topology (4 IK legs + 2 IK scythes, body/abdomen/neck/head/jaws/tail), so MonsterView animates it unchanged.
import * as THREE from 'three';
import { joint, solveTwoBone } from './kit';
import type { MonsterRig, LegChain, MonsterSpec } from './monster';
import { GenAsset, cloneNode } from './gen/library';
import { genMaterial, genGlow, bindSlots } from './gen/genmat';
import REAVER_JSON from '../../assetgen/specs/reaver.json';

export type ReaverSpec = typeof REAVER_JSON;
export const REAVER_SPEC: ReaverSpec = REAVER_JSON;

export function reaverMaterials(p: ReaverSpec['palette']) {
  return {
    shell: genMaterial({ color: p.shell, roughness: 0.4, metalness: 0.8, edge: 0.45, edgeColor: '#d6dbe2', edgeRough: 0.3, cavity: 0.7, detail: 0.12, detailRepeat: 1.5, envMapIntensity: 1.0 }),
    shellDark: genMaterial({ color: p.shellDark, roughness: 0.4, metalness: 0.7, edge: 0.4, edgeColor: '#7a828c', cavity: 0.6 }),
    flesh: genMaterial({ color: p.flesh, roughness: 0.42, metalness: 0.05, emissive: p.flesh, emissiveIntensity: 0.25, edge: 0.08, edgeColor: '#6a1018', edgeMetal: 0, edgeRough: 0.3, cavity: 0.5, detail: 0.3, detailRepeat: 3 }),
    glow: genGlow(p.glow, 2.6),
    spike: genMaterial({ color: p.spike, roughness: 0.3, metalness: 0.35, emissive: p.spike, emissiveIntensity: 0.3, edge: 0.18, edgeColor: '#ff3a26', edgeMetal: 0.3, cavity: 0.4 }),
    eye: genGlow(p.eye, 4.2),
    teeth: genMaterial({ color: p.teeth, roughness: 0.4, metalness: 0, edge: 0.2, edgeColor: '#fff6e6', edgeMetal: 0 }),
  };
}

type V3 = [number, number, number];

export function buildReaver(asset: GenAsset, spec: ReaverSpec = REAVER_SPEC): MonsterRig {
  const S = spec.skeleton;
  const mats = reaverMaterials(spec.palette);
  const root = new THREE.Group(); root.name = 'monster';
  const model = joint('model', root); model.rotation.y = Math.PI / 2; model.scale.setScalar(spec.scale);
  const j: Record<string, THREE.Group> = {};
  j.body = joint('body', model, [0, S.bodyY, 0]); j.body.rotation.x = S.bodyPitch;
  j.abdomen = joint('abdomen', j.body, S.abdomen as V3); j.abdomen.rotation.x = S.abdomenPitch;
  j.neck = joint('neck', j.body, S.neck as V3);
  j.head = joint('head', j.neck, S.head as V3); j.head.rotation.x = S.headPitch; j.head.scale.setScalar(S.headScale);
  j.jawL = joint('jawL', j.head, [S.jaw[0], S.jaw[1], S.jaw[2]]);
  j.jawR = joint('jawR', j.head, [-S.jaw[0], S.jaw[1], S.jaw[2]]);
  j.tail = joint('tail', j.abdomen, S.tail as V3);
  for (const n of ['body', 'abdomen', 'neck', 'head', 'jawL', 'jawR', 'tail']) j[n].add(cloneNode(asset, n));

  const legs: LegChain[] = [];
  for (const d of S.legs) {
    const hip = joint(d.name + 'Hip', j.body, d.hip as V3);
    const upper = joint(d.name + 'Upper', hip);
    const lower = joint(d.name + 'Lower', upper, [0, -d.a, 0]);
    upper.add(cloneNode(asset, d.name + 'Upper')); lower.add(cloneNode(asset, d.name + 'Lower'));
    legs.push({ hip, upper, lower, a: d.a, b: d.b, rest: new THREE.Vector3(...(d.foot as V3)), pole: new THREE.Vector3(d.side * 1.5, 2.0, d.foot[2] > 0 ? 0.7 : -0.7), side: d.side });
  }
  const arms: LegChain[] = [];
  const ar = S.arms;
  for (const side of [1, -1]) {
    const s = side > 0 ? 'L' : 'R';
    const hip = joint('arm' + s, j.body, [ar.hip[0] * side, ar.hip[1], ar.hip[2]]);
    const upper = joint('armUpper', hip);
    const lower = joint('armBlade', upper, [0, -ar.a, 0]);
    upper.add(cloneNode(asset, 'armUpper' + s)); lower.add(cloneNode(asset, 'armBlade' + s));
    arms.push({ hip, upper, lower, a: ar.a, b: ar.b, rest: new THREE.Vector3(ar.rest[0] * side, ar.rest[1], ar.rest[2]), pole: new THREE.Vector3(ar.pole[0] * side, ar.pole[1], ar.pole[2]), side });
  }
  bindSlots(root, mats as unknown as Record<string, THREE.Material>);

  const monsterSpec: MonsterSpec = { palette: { ...spec.palette }, dorsalSpikes: spec.dorsalSpikes, scale: spec.scale };
  const rig: MonsterRig = {
    root, model, j, legs, arms, bodyRestY: S.bodyY, mats: mats as unknown as MonsterRig['mats'], spec: monsterSpec,
    solveLegs(targets?: THREE.Vector3[]) {
      root.updateMatrixWorld(true);
      legs.forEach((L, i) => {
        const t = L.hip.worldToLocal(model.localToWorld((targets?.[i] ?? L.rest).clone()));
        const p = L.hip.worldToLocal(model.localToWorld(L.pole.clone()));
        solveTwoBone(L.upper, L.lower, L.a, L.b, t, p);
      });
    },
    solveArms(targets?: THREE.Vector3[]) {
      root.updateMatrixWorld(true);
      arms.forEach((A, i) => {
        const t = A.hip.worldToLocal(model.localToWorld((targets?.[i] ?? A.rest).clone()));
        const p = A.hip.worldToLocal(model.localToWorld(A.pole.clone()));
        solveTwoBone(A.upper, A.lower, A.a, A.b, t, p);
      });
    },
  };
  rig.solveLegs(); rig.solveArms();
  (rig as any).variant = 'reaver';
  return rig;
}
