// Modelling kit: parts are declared against rig joints and merged per (joint, material) for few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];

export class Kit {
  private parts = new Map<THREE.Object3D, Map<string, THREE.BufferGeometry[]>>();
  constructor(public mats: Record<string, THREE.Material>) {}

  /** Add a geometry to joint `j` with local transform. Rotation in radians (XYZ). */
  add(j: THREE.Object3D, geo: THREE.BufferGeometry, mat: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 | number = 1) {
    if (!this.mats[mat]) throw new Error('unknown material ' + mat);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      typeof scl === 'number' ? new THREE.Vector3(scl, scl, scl) : new THREE.Vector3(...scl),
    );
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    g.applyMatrix4(m);
    let byMat = this.parts.get(j);
    if (!byMat) { byMat = new Map(); this.parts.set(j, byMat); }
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(g);
    return this;
  }

  /** Mirror helper: adds part at (x,..) and (-x,..) with mirrored Y/Z rotation. */
  addSym(jL: THREE.Object3D, jR: THREE.Object3D | null, geo: THREE.BufferGeometry, mat: string, pos: V3, rot: V3 = [0, 0, 0], scl: V3 | number = 1) {
    this.add(jL, geo, mat, pos, rot, scl);
    this.add(jR ?? jL, geo, mat, [jR ? pos[0] : -pos[0], pos[1], pos[2]], [rot[0], -rot[1], -rot[2]], scl);
    return this;
  }

  build(opts: { castShadow?: boolean; receiveShadow?: boolean } = {}) {
    const meshes: THREE.Mesh[] = [];
    for (const [j, byMat] of this.parts) {
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos, false)!;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, this.mats[mat]);
        mesh.castShadow = opts.castShadow ?? true;
        mesh.receiveShadow = opts.receiveShadow ?? true;
        mesh.name = `${j.name}:${mat}`;
        j.add(mesh);
        meshes.push(mesh);
        geos.forEach((g) => g.dispose());
      }
    }
    this.parts.clear();
    return meshes;
  }
}

// ---------------------------------------------------------------- geometry shortcuts (cached)
const gcache = new Map<string, THREE.BufferGeometry>();
const cached = (k: string, f: () => THREE.BufferGeometry) => { let g = gcache.get(k); if (!g) { g = f(); gcache.set(k, g); } return g; };

export const G = {
  box: (w: number, h: number, d: number, r = 0.02, seg = 2) => cached(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))),
  cube: (w: number, h: number, d: number) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, s = 12, open = false) => cached(`c${rt},${rb},${h},${s},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open)),
  sph: (r: number, ws = 16, hs = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => cached(`s${r},${ws},${hs},${ps},${pl},${ts},${tl}`, () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl)),
  cap: (r: number, l: number, s = 10) => cached(`cp${r},${l},${s}`, () => new THREE.CapsuleGeometry(r, l, 4, s)),
  cone: (r: number, h: number, s = 8) => cached(`cn${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
  torus: (r: number, t: number, rs = 8, ts = 24, arc = Math.PI * 2) => cached(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  /** Extruded 2D profile (in XY), extruded along Z by depth, centred. */
  prism: (pts: [number, number][], depth: number, bevel = 0.01) => cached(`p${JSON.stringify(pts)},${depth},${bevel}`, () => {
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  }),
  /** Curved horn / claw: tapered tube along a quadratic bend in the YZ plane. */
  horn: (len: number, r0: number, bend: number, seg = 8, radial = 6) => cached(`h${len},${r0},${bend},${seg},${radial}`, () => {
    const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, len * 0.55, bend * 0.4), new THREE.Vector3(0, len, bend));
    const g = new THREE.TubeGeometry(path, seg, r0, radial, false);
    // taper: scale radius along the tube by v
    const pos = g.attributes.position, uv = g.attributes.uv;
    const c = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = uv.getX(i);
      path.getPoint(t, c);
      p.fromBufferAttribute(pos, i).sub(c).multiplyScalar(Math.max(0.02, 1 - t)).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    return g;
  }),
};

// ---------------------------------------------------------------- two-bone IK
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Solve a two-bone chain whose bones point along -Y in rest pose.
 * upper: child of `space`; lower: child of upper at (0,-a,0). target and pole are in `space` coordinates.
 */
export function solveTwoBone(upper: THREE.Object3D, lower: THREE.Object3D, a: number, b: number, target: THREE.Vector3, pole: THREE.Vector3) {
  const S = upper.position;
  const d = _v.copy(target).sub(S);
  let L = d.length();
  L = Math.min(Math.max(L, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  d.normalize();
  // angle at shoulder between target dir and upper bone
  const cosA = (a * a + L * L - b * b) / (2 * a * L);
  const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
  // bend plane from pole
  const pv = _w.copy(pole).sub(S);
  pv.sub(d.clone().multiplyScalar(pv.dot(d))).normalize();
  const elbowDir = d.clone().multiplyScalar(Math.cos(ang)).add(pv.multiplyScalar(Math.sin(ang))).normalize();
  upper.quaternion.setFromUnitVectors(DOWN, elbowDir);
  const elbow = S.clone().add(elbowDir.clone().multiplyScalar(a));
  const handDir = target.clone().sub(elbow).normalize();
  // to upper-local space
  _q.copy(upper.quaternion).invert();
  handDir.applyQuaternion(_q);
  lower.quaternion.setFromUnitVectors(DOWN, handDir);
}

export function joint(name: string, parent: THREE.Object3D | null, pos: V3 = [0, 0, 0]) {
  const j = new THREE.Group(); j.name = name; j.position.set(...pos);
  parent?.add(j);
  return j;
}
