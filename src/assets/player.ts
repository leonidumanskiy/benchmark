// Player "Ranger": parametric hard-surface trooper built on a joint hierarchy (model faces +Z, up +Y).
import * as THREE from 'three';
import { Kit, G, joint, solveTwoBone } from './kit';
import { withPanels, glow } from './materials';

export interface PlayerSpec {
  palette: { armor: string; armorDark: string; accent: string; suit: string; visor: string; gunGlow: string; leather: string; lights: string };
  equipment: {
    backpack: 'pack' | 'reactor';
    antenna: boolean;
    pauldron: 'heavy' | 'light';
    shoulderLamp: boolean;
    kneePads: boolean;
  };
  scale: number;
}

/** Shared description of the player. Editing this changes the character consistently from every angle. */
export const PLAYER_SPEC: PlayerSpec = {
  palette: { armor: '#6a717c', armorDark: '#30343b', accent: '#b8261d', suit: '#1d1f24', visor: '#ffa53a', gunGlow: '#ff3b2a', leather: '#4a3d2c', lights: '#ff3b2a' },
  equipment: { backpack: 'reactor', antenna: true, pauldron: 'heavy', shoulderLamp: true, kneePads: true },
  scale: 1,
};

export interface PlayerRig {
  root: THREE.Group; // sim-facing root (+X forward after internal rotation)
  model: THREE.Group; // model space (+Z forward)
  j: Record<string, THREE.Group>;
  gun: THREE.Group; muzzle: THREE.Object3D;
  gripR: THREE.Object3D; gripL: THREE.Object3D;
  dims: { upper: number; lower: number; thigh: number; shin: number; hipY: number; stanceYaw: number };
  /** re-solve arm IK so hands stay on the gun (call after moving gun/chest) */
  solveArms(): void;
  /** re-solve leg IK for given foot targets in hips-parent (model) space */
  solveLegs(footL: THREE.Vector3, footR: THREE.Vector3): void;
  spec: PlayerSpec;
}

export function buildPlayer(spec: PlayerSpec = PLAYER_SPEC): PlayerRig {
  const P = spec.palette, E = spec.equipment;
  const mats = {
    armor: withPanels(P.armor, 0.5, 0.4, 2, 3, 0.35),
    armorDark: withPanels(P.armorDark, 0.55, 0.45, 2, 3, 0.3),
    accent: withPanels(P.accent, 0.5, 0.2, 2, 3, 0.25),
    suit: new THREE.MeshStandardMaterial({ color: P.suit, roughness: 0.85, metalness: 0.1 }),
    leather: new THREE.MeshStandardMaterial({ color: P.leather, roughness: 0.8, metalness: 0.05 }),
    gun: withPanels('#3a3e45', 0.4, 0.6, 3, 3, 0.3),
    gunDark: new THREE.MeshStandardMaterial({ color: '#111216', roughness: 0.5, metalness: 0.7 }),
    visor: glow(P.visor, 2.6),
    gunGlow: glow(P.gunGlow, 3),
    lights: glow(P.lights, 3.2),
    lens: glow('#59e6ff', 2.5),
  };
  const k = new Kit(mats);
  const root = new THREE.Group(); root.name = 'player';
  const model = joint('model', root); model.rotation.y = Math.PI / 2; // +Z (model) -> +X (sim facing)
  model.scale.setScalar(spec.scale);

  const hipY = 0.96, thigh = 0.44, shin = 0.44;
  const j: Record<string, THREE.Group> = {};
  j.hips = joint('hips', model, [0, hipY, 0]);
  j.spine = joint('spine', j.hips, [0, 0.1, 0]);
  j.chest = joint('chest', j.spine, [0, 0.24, 0]);
  j.neck = joint('neck', j.chest, [0, 0.24, 0.0]);
  j.head = joint('head', j.neck, [0, 0.07, 0.02]);
  for (const [s, x] of [['L', 1], ['R', -1]] as const) {
    j['thigh' + s] = joint('thigh' + s, j.hips, [0.12 * x, -0.04, 0]);
    j['shin' + s] = joint('shin' + s, j['thigh' + s], [0, -thigh, 0]);
    j['foot' + s] = joint('foot' + s, j['shin' + s], [0, -shin, 0]);
    j['upper' + s] = joint('upper' + s, j.chest, [0.25 * x, 0.15, -0.01]);
    j['fore' + s] = joint('fore' + s, j['upper' + s], [0, -0.29, 0]);
    j['hand' + s] = joint('hand' + s, j['fore' + s], [0, -0.285, 0]);
  }
  const upper = 0.29, lower = 0.285;
  /** bladed rifle stance: chest yawed so the support shoulder leads; head/neck counter-rotate */
  const STANCE_YAW = -0.55;
  j.chest.rotation.y = STANCE_YAW; j.neck.rotation.y = -STANCE_YAW * 0.8;

  // ---------------------------------------------------------------- legs
  for (const [s, x] of [['L', 1], ['R', -1]] as const) {
    const T = j['thigh' + s], S = j['shin' + s], F = j['foot' + s];
    k.add(T, G.cap(0.085, 0.26), 'suit', [0, -0.2, 0]);
    k.add(T, G.box(0.2, 0.27, 0.22, 0.05), 'armor', [0.012 * x, -0.19, 0.012]);
    k.add(T, G.box(0.07, 0.18, 0.2, 0.02), 'armorDark', [0.1 * x, -0.17, 0]); // side holster plate
    if (s === 'R') { k.add(T, G.box(0.06, 0.16, 0.12, 0.02), 'leather', [-0.13, -0.15, 0.02]); k.add(T, G.cube(0.04, 0.06, 0.06), 'gunDark', [-0.16, -0.08, 0.03]); }
    k.add(S, G.cap(0.075, 0.28), 'suit', [0, -0.22, 0]);
    k.add(S, G.box(0.17, 0.3, 0.2, 0.05), 'armor', [0, -0.24, 0.03]);
    k.add(S, G.box(0.13, 0.22, 0.04, 0.015), 'armorDark', [0, -0.24, 0.135]);
    if (E.kneePads) { k.add(S, G.box(0.16, 0.14, 0.12, 0.04), 'accent', [0, -0.02, 0.1]); k.add(S, G.cube(0.1, 0.02, 0.02), 'armorDark', [0, -0.02, 0.165]); }
    k.add(F, G.box(0.16, 0.12, 0.3, 0.035), 'armorDark', [0, -0.03, 0.06]);
    k.add(F, G.box(0.17, 0.04, 0.32, 0.015), 'suit', [0, -0.085, 0.06]);
    k.add(F, G.box(0.14, 0.06, 0.08, 0.02), 'armor', [0, 0.0, 0.17]);
  }

  // ---------------------------------------------------------------- pelvis + belt
  k.add(j.hips, G.box(0.36, 0.2, 0.25, 0.05), 'suit', [0, -0.02, 0]);
  k.add(j.hips, G.box(0.3, 0.16, 0.06, 0.03), 'armor', [0, -0.07, 0.125]); // codpiece / front plate
  k.add(j.hips, G.box(0.4, 0.06, 0.28, 0.02), 'leather', [0, 0.06, 0]); // belt
  k.add(j.hips, G.cube(0.07, 0.05, 0.02), 'gunDark', [0, 0.06, 0.145]); // buckle
  for (const x of [-0.17, 0.17]) k.add(j.hips, G.box(0.08, 0.1, 0.1, 0.02), 'leather', [x, 0.0, 0.09]); // pouches
  k.add(j.hips, G.box(0.22, 0.12, 0.08, 0.02), 'leather', [0, 0.0, -0.15]);
  for (const x of [-1, 1]) k.add(j.hips, G.box(0.06, 0.2, 0.2, 0.03), 'armor', [0.2 * x, -0.1, 0], [0, 0, 0.1 * x]); // hip skirts

  // ---------------------------------------------------------------- torso
  k.add(j.spine, G.box(0.3, 0.2, 0.2, 0.06), 'suit', [0, 0.1, 0]);
  for (let i = 0; i < 3; i++) k.add(j.spine, G.box(0.24, 0.05, 0.05, 0.02), 'armorDark', [0, 0.04 + i * 0.065, 0.1]); // ab ribs
  k.add(j.chest, G.box(0.48, 0.34, 0.3, 0.08), 'armor', [0, 0.06, 0.0]);
  k.add(j.chest, G.prism([[-0.2, -0.14], [0.2, -0.14], [0.22, 0.08], [0.12, 0.17], [-0.12, 0.17], [-0.22, 0.08]], 0.06, 0.012), 'armorDark', [0, 0.05, 0.155]);
  k.add(j.chest, G.box(0.14, 0.06, 0.03, 0.01), 'accent', [0.1, 0.13, 0.19]); // red chest flash
  k.add(j.chest, G.box(0.05, 0.13, 0.03, 0.01), 'accent', [-0.13, 0.03, 0.19]);
  k.add(j.chest, G.cube(0.06, 0.02, 0.01), 'lights', [-0.08, 0.15, 0.192]); // status LEDs
  k.add(j.chest, G.torus(0.13, 0.04, 6, 18), 'armorDark', [0, 0.22, 0], [Math.PI / 2, 0, 0]); // collar ring
  for (const x of [-1, 1]) k.add(j.chest, G.box(0.06, 0.07, 0.07, 0.015), 'leather', [0.07 * x, -0.06, 0.18]); // mag pouches

  // backpack
  if (E.backpack === 'pack') {
    k.add(j.chest, G.box(0.42, 0.46, 0.2, 0.05), 'armorDark', [0, 0.04, -0.24]);
    k.add(j.chest, G.box(0.36, 0.3, 0.06, 0.02), 'accent', [0, 0.07, -0.36]); // red outer shell panel
    k.add(j.chest, G.box(0.24, 0.05, 0.02, 0.01), 'armorDark', [0, 0.14, -0.395]);
    k.add(j.chest, G.cube(0.12, 0.025, 0.012), 'lights', [0.0, 0.0, -0.395]);
    for (const x of [-1, 1]) k.add(j.chest, G.cyl(0.055, 0.055, 0.36, 10), 'armor', [0.25 * x, 0.02, -0.24]); // side canisters
    for (const x of [-1, 1]) k.add(j.chest, G.cyl(0.058, 0.058, 0.05, 10), 'accent', [0.25 * x, 0.1, -0.24]);
    k.add(j.chest, G.box(0.38, 0.08, 0.16, 0.02), 'leather', [0, -0.22, -0.24]); // bedroll
  } else {
    // reactor pack: cylindrical power core with glowing window
    k.add(j.chest, G.box(0.36, 0.42, 0.12, 0.04), 'armorDark', [0, 0.04, -0.2]);
    k.add(j.chest, G.cyl(0.11, 0.11, 0.42, 14), 'gunGlow', [0, 0.06, -0.32]); // exposed power core
    for (const y of [-0.17, 0.29]) k.add(j.chest, G.cyl(0.14, 0.14, 0.07, 14), 'armor', [0, y, -0.32]); // end caps
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; k.add(j.chest, G.cube(0.035, 0.42, 0.035), 'armorDark', [Math.cos(a) * 0.125, 0.06, -0.32 + Math.sin(a) * 0.125]); }
    for (const y of [-0.13, 0.06, 0.25]) k.add(j.chest, G.torus(0.135, 0.022, 6, 16), 'armorDark', [0, y, -0.32], [Math.PI / 2, 0, 0]);
    k.add(j.chest, G.cyl(0.03, 0.03, 0.32, 8), 'armorDark', [0.17, 0.05, -0.28], [0.3, 0, 0]);
  }
  if (E.antenna) {
    k.add(j.chest, G.cyl(0.008, 0.012, 0.55, 5), 'gunDark', [-0.16, 0.48, -0.3], [-0.12, 0, 0.05]);
    k.add(j.chest, G.sph(0.022, 8, 6), 'lights', [-0.145, 0.75, -0.335]);
    k.add(j.chest, G.cyl(0.03, 0.03, 0.06, 8), 'armor', [-0.17, 0.22, -0.3]);
  }

  // shoulders: layered angular pauldrons (on the chest so they don't follow arm IK twist)
  for (const x of [-1, 1]) {
    const big = E.pauldron === 'heavy';
    const w = big ? 1 : 0.8;
    k.add(j.chest, G.box(0.2 * w, 0.09, 0.27 * w, 0.03), 'armor', [0.3 * x, 0.22, 0], [0, 0, -0.42 * x]);
    k.add(j.chest, G.box(0.19 * w, 0.08, 0.25 * w, 0.03), 'armorDark', [0.36 * x, 0.14, 0], [0, 0, -0.75 * x]);
    k.add(j.chest, G.box(0.17 * w, 0.03, 0.27 * w, 0.01), 'accent', [0.315 * x, 0.27, 0], [0, 0, -0.42 * x]);
    if (big) k.add(j.chest, G.box(0.05, 0.12, 0.2, 0.015), 'armor', [0.43 * x, 0.06, 0], [0, 0, -0.15 * x]);
  }
  if (E.shoulderLamp) {
    k.add(j.chest, G.box(0.08, 0.07, 0.1, 0.015), 'armorDark', [-0.3, 0.26, 0.05]);
    k.add(j.chest, G.cyl(0.028, 0.028, 0.02, 10), 'lens', [-0.3, 0.26, 0.105], [Math.PI / 2, 0, 0]);
  }

  // ---------------------------------------------------------------- head
  k.add(j.neck, G.cyl(0.06, 0.07, 0.1, 10), 'suit', [0, 0.0, 0]);
  k.add(j.head, G.sph(0.16, 18, 14), 'armor', [0, 0.1, -0.01], [0, 0, 0], [1, 1.0, 1.12]);
  k.add(j.head, G.sph(0.135, 16, 10, -1.1, 2.2, 0.9, 0.75), 'visor', [0, 0.1, 0.04], [0, 0, 0], [1.12, 1, 1.12]); // visor band
  k.add(j.head, G.box(0.05, 0.1, 0.03, 0.01), 'visor', [0, 0.04, 0.19]); // T-slot
  k.add(j.head, G.box(0.14, 0.08, 0.09, 0.025), 'armorDark', [0, 0.0, 0.12]); // rebreather
  for (const x of [-1, 1]) {
    k.add(j.head, G.cyl(0.03, 0.03, 0.04, 8), 'armorDark', [0.035 * x, 0.02, 0.15], [Math.PI / 2, 0, 0]);
    k.add(j.head, G.cyl(0.05, 0.05, 0.05, 12), 'armorDark', [0.145 * x, 0.09, -0.01], [0, 0, Math.PI / 2]); // ear modules
    k.add(j.head, G.cyl(0.03, 0.03, 0.054, 10), 'accent', [0.145 * x, 0.09, -0.01], [0, 0, Math.PI / 2]);
  }
  k.add(j.head, G.box(0.04, 0.05, 0.26, 0.015), 'accent', [0, 0.25, -0.02]); // crest stripe
  k.add(j.head, G.box(0.24, 0.07, 0.06, 0.02), 'armorDark', [0, 0.16, -0.14]);

  // ---------------------------------------------------------------- arms
  for (const [s, x] of [['L', 1], ['R', -1]] as const) {
    const U = j['upper' + s], F = j['fore' + s], H = j['hand' + s];
    k.add(U, G.cap(0.06, 0.18), 'suit', [0, -0.13, 0]);
    k.add(U, G.box(0.13, 0.16, 0.13, 0.04), 'armor', [0, -0.12, 0]);
    k.add(F, G.cap(0.055, 0.16), 'suit', [0, -0.12, 0]);
    k.add(F, G.box(0.12, 0.17, 0.12, 0.035), 'armorDark', [0, -0.14, 0]); // gauntlet
    k.add(F, G.box(0.04, 0.1, 0.13, 0.015), 'accent', [0.05 * x, -0.13, 0]);
    k.add(F, G.cube(0.02, 0.04, 0.05), 'lights', [0.07 * x, -0.13, 0]);
    k.add(H, G.box(0.09, 0.1, 0.07, 0.025), 'suit', [0, -0.04, 0]);
    k.add(H, G.box(0.08, 0.05, 0.075, 0.015), 'armorDark', [0, -0.01, 0]);
  }

  // ---------------------------------------------------------------- rifle (child of chest; arms solve to its grips)
  const gun = joint('gun', j.spine, [-0.1, 0.24, 0.2]); // on the spine: chest twist doesn't steer the barrel
  const gk = new Kit(mats);
  gk.add(gun, G.box(0.08, 0.12, 0.42, 0.015), 'gun', [0, 0, 0.12]); // receiver
  gk.add(gun, G.box(0.085, 0.05, 0.3, 0.012), 'gunDark', [0, 0.075, 0.1]); // top rail
  gk.add(gun, G.box(0.075, 0.1, 0.3, 0.02), 'gunDark', [0, -0.005, 0.46]); // handguard
  gk.add(gun, G.cube(0.084, 0.012, 0.22), 'gunGlow', [0, 0.02, 0.47]); // glowing coil strips
  gk.add(gun, G.cube(0.084, 0.012, 0.22), 'gunGlow', [0, -0.025, 0.47]);
  gk.add(gun, G.cyl(0.022, 0.022, 0.26, 10), 'gunDark', [0, 0.0, 0.72], [Math.PI / 2, 0, 0]); // barrel
  gk.add(gun, G.cyl(0.036, 0.03, 0.08, 8), 'gun', [0, 0.0, 0.85], [Math.PI / 2, 0, 0]); // muzzle brake
  gk.add(gun, G.box(0.06, 0.16, 0.08, 0.015), 'gunDark', [0, -0.12, 0.2], [0.35, 0, 0]); // magazine
  gk.add(gun, G.box(0.05, 0.11, 0.06, 0.015), 'gunDark', [0, -0.09, 0.0], [-0.25, 0, 0]); // pistol grip
  gk.add(gun, G.box(0.06, 0.1, 0.22, 0.02), 'gun', [0, -0.02, -0.17]); // stock
  gk.add(gun, G.box(0.065, 0.04, 0.06, 0.01), 'accent', [0, 0.03, -0.25]);
  gk.add(gun, G.cyl(0.03, 0.03, 0.16, 10), 'gunDark', [0, 0.13, 0.1], [Math.PI / 2, 0, 0]); // scope
  gk.add(gun, G.cyl(0.024, 0.024, 0.005, 10), 'lens', [0, 0.13, 0.182], [Math.PI / 2, 0, 0]);
  gk.add(gun, G.box(0.02, 0.06, 0.05, 0.005), 'gunDark', [0, -0.08, 0.36]); // fore grip
  gk.build();
  const muzzle = joint('muzzle', gun, [0, 0, 0.9]);
  const gripR = joint('gripR', gun, [-0.0, -0.1, 0.02]);
  const gripL = joint('gripL', gun, [0.0, -0.09, 0.35]);

  k.build();

  const tmp = new THREE.Vector3();
  const rig: PlayerRig = {
    root, model, j, gun, muzzle, gripR, gripL, spec,
    dims: { upper, lower, thigh, shin, hipY, stanceYaw: STANCE_YAW },
    solveArms() {
      // targets in chest space
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
        // keep feet flat: counter-rotate the foot
        const q = new THREE.Quaternion();
        j['thigh' + s].getWorldQuaternion(q);
        const qs = new THREE.Quaternion(); j['shin' + s].getWorldQuaternion(qs);
        const qm = new THREE.Quaternion(); model.getWorldQuaternion(qm);
        j['foot' + s].quaternion.copy(qs.invert().multiply(qm));
      }
    },
  };
  rig.solveLegs(new THREE.Vector3(0.13, 0.09, 0.02), new THREE.Vector3(-0.13, 0.09, -0.04));
  rig.solveArms();
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.userData.part = 'player'; });
  return rig;
}
