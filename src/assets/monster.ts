// Monster "Ravager": armoured hexapod predator. Parametric; built on joints for procedural animation (model faces +Z).
import * as THREE from 'three';
import { Kit, G, joint, solveTwoBone } from './kit';
import { chitinMaterials } from './materials';

export interface MonsterSpec {
  palette: { shell: string; shellDark: string; flesh: string; glow: string; spike: string; eye: string };
  dorsalSpikes: number;
  scale: number;
}

export const MONSTER_SPEC: MonsterSpec = {
  palette: { shell: '#9aa3b0', shellDark: '#3e434b', flesh: '#4a0c12', glow: '#ff2a2a', spike: '#d01b22', eye: '#ff4a1a' },
  dorsalSpikes: 5,
  scale: 0.92,
};

export interface LegChain { hip: THREE.Group; upper: THREE.Group; lower: THREE.Group; a: number; b: number; rest: THREE.Vector3; pole: THREE.Vector3; side: number }

export interface MonsterRig {
  root: THREE.Group; model: THREE.Group;
  j: Record<string, THREE.Group>;
  legs: LegChain[]; // 4 walking legs: FL? no — mid L/R, rear L/R
  arms: LegChain[]; // 2 front scythes
  bodyRestY: number;
  /** solve all legs to their foot targets (model space). targets default to rest */
  solveLegs(targets?: THREE.Vector3[]): void;
  solveArms(targets?: THREE.Vector3[]): void;
  mats: ReturnType<typeof chitinMaterials>;
  spec: MonsterSpec;
}

export function buildMonster(spec: MonsterSpec = MONSTER_SPEC, mats = chitinMaterials(spec.palette)): MonsterRig {
  const k = new Kit(mats as unknown as Record<string, THREE.Material>);
  const root = new THREE.Group(); root.name = 'monster';
  const model = joint('model', root); model.rotation.y = Math.PI / 2; model.scale.setScalar(spec.scale);
  const bodyY = 0.92;
  const j: Record<string, THREE.Group> = {};
  j.body = joint('body', model, [0, bodyY, 0]);
  j.body.rotation.x = -0.16; // aggressive stance: chest raised
  j.abdomen = joint('abdomen', j.body, [0, 0.0, -0.36]);
  j.neck = joint('neck', j.body, [0, 0.0, 0.5]);
  j.head = joint('head', j.neck, [0, -0.02, 0.22]);
  j.head.rotation.x = 0.22;
  j.head.scale.setScalar(1.3);
  j.jawL = joint('jawL', j.head, [0.11, -0.1, 0.22]);
  j.jawR = joint('jawR', j.head, [-0.11, -0.1, 0.22]);
  j.tail = joint('tail', j.abdomen, [0, 0.0, -0.5]);

  // ---------------------------------------------------------------- thorax (short, hunched, armoured)
  k.add(j.body, G.sph(0.5, 9, 6), 'shellDark', [0, -0.02, 0.02], [0, 0, 0], [0.66, 0.56, 0.78]);
  k.add(j.body, G.sph(0.5, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'shell', [0, 0.1, 0.12], [-0.3, 0, 0], [0.72, 0.62, 0.62]); // shoulder hump
  k.add(j.body, G.sph(0.42, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'shell', [0, 0.06, -0.18], [-0.05, 0, 0], [0.7, 0.55, 0.55]);
  k.add(j.body, G.box(0.06, 0.05, 0.62, 0.02), 'glow', [0, 0.33, 0.0], [-0.25, 0, 0]); // glowing spine seam
  for (const x of [-1, 1]) {
    k.add(j.body, G.sph(0.22, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'shell', [0.27 * x, 0.08, 0.28], [0, 0, -0.5 * x], [1, 0.6, 1.2]); // pauldron plates
    k.add(j.body, G.box(0.1, 0.2, 0.6, 0.04), 'shellDark', [0.3 * x, -0.06, 0.0], [0, 0, 0.35 * x]); // leg-mount flanges
    for (let i = 0; i < 3; i++) k.add(j.body, G.sph(0.045, 8, 6), 'glow', [0.34 * x, -0.14, 0.18 - i * 0.16]); // vents
  }
  for (let i = 0; i < 4; i++) k.add(j.body, G.torus(0.2, 0.03, 6, 14, Math.PI), 'flesh', [0, -0.16, 0.25 - i * 0.14], [0, 0, Math.PI]); // underside ribs
  // swept-back horns along the spine (signature silhouette)
  for (let i = 0; i < spec.dorsalSpikes; i++) {
    const t = i / Math.max(1, spec.dorsalSpikes - 1);
    const z = 0.32 - t * 0.6;
    const h = 0.62 - t * 0.28;
    for (const x of [-1, 1]) k.add(j.body, G.horn(h, 0.05, -0.38, 7, 6), 'spike', [0.1 * x, 0.26 - t * 0.06, z], [-0.55, 0, -0.32 * x]);
  }

  // ---------------------------------------------------------------- abdomen (compact, armoured, glowing sacs)
  j.abdomen.rotation.x = 0.35; // hangs down behind
  k.add(j.abdomen, G.sph(0.3, 9, 6), 'flesh', [0, -0.04, -0.16], [0, 0, 0], [0.75, 0.62, 0.95]);
  for (let i = 0; i < 3; i++) k.add(j.abdomen, G.sph(0.3, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), 'shell', [0, 0.06 - i * 0.03, -0.06 - i * 0.17], [-0.2 - i * 0.18, 0, 0], [0.95 - i * 0.12, 0.6, 0.6]);
  for (const x of [-1, 1]) for (let i = 0; i < 3; i++) k.add(j.abdomen, G.sph(0.04, 8, 6), 'glow', [0.22 * x, -0.06 - i * 0.02, -0.1 - i * 0.13]);
  k.add(j.tail, G.horn(0.45, 0.055, -0.35, 8, 6), 'spike', [0, 0.05, 0.2], [-2.1, 0, 0]);

  // ---------------------------------------------------------------- neck + head (big wedge skull, splayed jaws)
  k.add(j.neck, G.cyl(0.14, 0.18, 0.26, 10), 'flesh', [0, -0.02, 0.04], [Math.PI / 2 - 0.3, 0, 0]);
  k.add(j.neck, G.sph(0.2, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'shell', [0, 0.04, 0.02], [-0.15, 0, 0], [1, 0.6, 1.1]);
  k.add(j.head, G.sph(0.22, 9, 6), 'shellDark', [0, -0.02, 0.08], [0, 0, 0], [0.85, 0.58, 1.3]);
  k.add(j.head, G.sph(0.23, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'shell', [0, 0.02, 0.04], [-0.1, 0, 0], [0.92, 0.55, 1.35]); // skull plate
  k.add(j.head, G.box(0.05, 0.05, 0.36, 0.02), 'spike', [0, 0.13, 0.02], [-0.12, 0, 0]); // crest ridge
  for (const x of [-1, 1]) {
    k.add(j.head, G.horn(0.5, 0.055, -0.42, 7, 6), 'spike', [0.13 * x, 0.06, -0.02], [-1.2, 0, -0.35 * x]); // swept horns
    k.add(j.head, G.horn(0.2, 0.03, -0.1, 5, 5), 'spike', [0.17 * x, -0.03, 0.14], [-0.9, 0, -1.1 * x]);
    for (let e = 0; e < 3; e++) k.add(j.head, G.sph(0.03 - e * 0.005, 8, 6), 'eye', [(0.08 + e * 0.04) * x, 0.04 - e * 0.012, 0.3 - e * 0.05]);
  }
  k.add(j.head, G.sph(0.12, 10, 8), 'glow', [0, -0.09, 0.25], [0, 0, 0], [0.95, 0.5, 0.85]); // glowing maw
  for (let i = 0; i < 6; i++) k.add(j.head, G.cone(0.014, 0.08, 5), 'teeth', [(-0.1 + i * 0.04), -0.04, 0.34], [Math.PI, 0, 0]);
  for (const [J, x] of [[j.jawL, 1], [j.jawR, -1]] as const) {
    k.add(J, G.horn(0.38, 0.05, 0, 6, 6), 'shell', [0, 0, 0], [Math.PI / 2 - 0.1, 0, -0.55 * x]);
    k.add(J, G.horn(0.16, 0.022, 0.0, 4, 5), 'spike', [0.12 * x, -0.01, 0.28], [Math.PI / 2 + 0.25, 0, -1.3 * x]);
  }

  // ---------------------------------------------------------------- legs (4 walking) + arms (2 scythes)
  const legs: LegChain[] = [];
  const legDefs = [
    { name: 'midL', side: 1, hip: [0.26, -0.05, 0.12], foot: [0.95, 0, 0.55], a: 0.66, b: 0.92 },
    { name: 'midR', side: -1, hip: [-0.26, -0.05, 0.12], foot: [-0.95, 0, 0.55], a: 0.66, b: 0.92 },
    { name: 'rearL', side: 1, hip: [0.24, -0.05, -0.22], foot: [0.9, 0, -0.75], a: 0.7, b: 0.95 },
    { name: 'rearR', side: -1, hip: [-0.24, -0.05, -0.22], foot: [-0.9, 0, -0.75], a: 0.7, b: 0.95 },
  ];
  for (const d of legDefs) {
    const hip = joint(d.name + 'Hip', j.body, d.hip as [number, number, number]);
    const upper = joint(d.name + 'Upper', hip);
    const lower = joint(d.name + 'Lower', upper, [0, -d.a, 0]);
    // upper segment: armoured, thick
    k.add(upper, G.cyl(0.09, 0.06, d.a, 8), 'shellDark', [0, -d.a / 2, 0]);
    k.add(upper, G.box(0.16, d.a * 0.8, 0.13, 0.05), 'shell', [0, -d.a * 0.45, 0.03]);
    k.add(upper, G.horn(0.22, 0.03, -0.1, 4, 5), 'spike', [0, -d.a, 0.02], [0.4, 0, 0]); // knee spike
    k.add(upper, G.sph(0.06, 9, 6), 'shellDark', [0, -d.a, 0]);
    // lower segment: thin, tapered, ending in claw
    k.add(lower, G.cyl(0.06, 0.025, d.b * 0.85, 7), 'shellDark', [0, -d.b * 0.42, 0]);
    k.add(lower, G.box(0.09, d.b * 0.45, 0.08, 0.025), 'shell', [0, -d.b * 0.27, 0.02]);
    k.add(lower, G.horn(0.16, 0.025, -0.08, 4, 5), 'spike', [0, -d.b * 0.5, 0.03], [0.6, 0, 0]);
    k.add(lower, G.cone(0.03, d.b * 0.2, 6), 'spike', [0, -d.b * 0.92, 0], [Math.PI, 0, 0]);
    legs.push({ hip, upper, lower, a: d.a, b: d.b, rest: new THREE.Vector3(...d.foot), pole: new THREE.Vector3(d.side * 1.5, 1.8, d.foot[2] > 0 ? 0.6 : -0.6), side: d.side });
  }
  const arms: LegChain[] = [];
  for (const side of [1, -1]) {
    const hip = joint(side > 0 ? 'armL' : 'armR', j.body, [0.22 * side, 0.08, 0.42]);
    const upper = joint('armUpper', hip);
    const a = 0.5, b = 0.72;
    const lower = joint('armBlade', upper, [0, -a, 0]);
    k.add(upper, G.cyl(0.07, 0.05, a, 8), 'shellDark', [0, -a / 2, 0]);
    k.add(upper, G.box(0.12, a * 0.7, 0.1, 0.035), 'shell', [0, -a * 0.45, 0.02]);
    k.add(upper, G.sph(0.07, 9, 6), 'flesh', [0, -a, 0]);
    // scythe blade: flattened curved horn
    k.add(lower, G.horn(b, 0.065, 0.25, 8, 6), 'shell', [0, 0, 0], [Math.PI, 0, 0], [0.55, 1, 1.5]);
    k.add(lower, G.horn(b * 0.85, 0.035, 0.3, 8, 5), 'spike', [0, -0.05, -0.04], [Math.PI, 0, 0], [0.5, 1, 1.2]);
    k.add(lower, G.box(0.09, 0.18, 0.1, 0.03), 'shellDark', [0, -0.08, 0]);
    arms.push({ hip, upper, lower, a, b, rest: new THREE.Vector3(0.42 * side, 0.5, 1.45), pole: new THREE.Vector3(0.7 * side, 2.6, 0.4), side });
  }

  k.build();

  const rig: MonsterRig = {
    root, model, j, legs, arms, bodyRestY: bodyY, mats, spec,
    solveLegs(targets?: THREE.Vector3[]) {
      root.updateMatrixWorld(true);
      legs.forEach((L, i) => {
        const tgt = targets?.[i] ?? L.rest;
        const t = L.hip.worldToLocal(model.localToWorld(tgt.clone()));
        const p = L.hip.worldToLocal(model.localToWorld(L.pole.clone()));
        solveTwoBone(L.upper, L.lower, L.a, L.b, t, p);
      });
    },
    solveArms(targets?: THREE.Vector3[]) {
      root.updateMatrixWorld(true);
      arms.forEach((A, i) => {
        const tgt = targets?.[i] ?? A.rest;
        const t = A.hip.worldToLocal(model.localToWorld(tgt.clone()));
        const p = A.hip.worldToLocal(model.localToWorld(A.pole.clone()));
        solveTwoBone(A.upper, A.lower, A.a, A.b, t, p);
      });
    },
  };
  rig.solveLegs();
  rig.solveArms();
  return rig;
}
