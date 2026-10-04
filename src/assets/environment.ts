// Environment kit: every gameplay obstacle gets a detailed visual that matches its collision footprint.
import * as THREE from 'three';
import { Kit, G, V3 } from './kit';
import { envMaterials } from './materials';
import { groundTexture, radialTexture } from './textures';
import { Obstacle, Decor, SpawnPoint } from '../sim/arena';
import { Rng } from '../sim/rng';
import { CFG } from '../sim/config';

export interface LampAnchor { pos: THREE.Vector3; color: number; kind: 'red' | 'cyan' | 'amber' }

function noise1(seed: number) {
  const r = new Rng(seed);
  const a = [r.next() * 6, r.next() * 6, r.next() * 6], f = [0.7 + r.next(), 1.9 + r.next() * 2, 4 + r.next() * 3];
  return (u: number) => (Math.sin(u * f[0] + a[0]) * 0.5 + Math.sin(u * f[1] + a[1]) * 0.3 + Math.sin(u * f[2] + a[2]) * 0.2) * 0.5 + 0.5;
}

/** Displaced icosphere rock. */
export function rockGeometry(r: number, seed: number, detail = 3) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const rng = new Rng(seed);
  const o = [rng.next() * 10, rng.next() * 10, rng.next() * 10];
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = 1 + 0.18 * Math.sin(n.x * 3.1 + o[0]) * Math.cos(n.z * 2.7 + o[1]) + 0.1 * Math.sin(n.y * 6.3 + o[2]) + 0.05 * Math.sin((n.x + n.z) * 11 + o[0]);
    // flatten facets slightly (chiselled look)
    v.copy(n).multiplyScalar(r * d);
    if (v.y < -r * 0.2) v.y = -r * 0.2 + (v.y + r * 0.2) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildObstacle(ob: Obstacle, lamps: LampAnchor[]): THREE.Object3D {
  const M = envMaterials();
  const k = new Kit(M);
  const grp = new THREE.Group(); grp.name = ob.id;
  const rng = new Rng(ob.seed * 7919 + 13);
  const s = ob.shape;
  grp.position.set(s.cx, 0, s.cz);
  const add = (geo: THREE.BufferGeometry, mat: string, pos: V3, rot: V3 = [0, 0, 0], scl: V3 | number = 1) => k.add(grp, geo, mat, pos, rot, scl);

  if (s.kind === 'box') {
    // local frame: long axis along X
    const alongX = s.hw >= s.hd;
    const L = 2 * Math.max(s.hw, s.hd), D = 2 * Math.min(s.hw, s.hd), H = ob.height;
    const frame = new THREE.Group(); frame.rotation.y = alongX ? 0 : Math.PI / 2; grp.add(frame);
    const fadd = (geo: THREE.BufferGeometry, mat: string, pos: V3, rot: V3 = [0, 0, 0], scl: V3 | number = 1) => k.add(frame, geo, mat, pos, rot, scl);
    const lampWorld = (x: number, y: number, z: number, kind: LampAnchor['kind']) => {
      const v = new THREE.Vector3(x, y, z); if (!alongX) v.set(z, y, -x);
      lamps.push({ pos: v.add(new THREE.Vector3(s.cx, 0, s.cz)), color: kind === 'red' ? 0xff2a1a : kind === 'cyan' ? 0x39d6ff : 0xffa630, kind });
    };

    if (ob.kind === 'wall') {
      const perimeter = ob.id.startsWith('wall_');
      const prof = noise1(ob.seed);
      const course = 0.42;
      const nC = Math.ceil(H / course);
      for (let c = 0; c < nC; c++) {
        let u = -L / 2 + (c % 2 ? -0.35 : 0);
        while (u < L / 2) {
          const bl = 0.6 + rng.next() * 0.45;
          const u0 = Math.max(-L / 2, u), u1 = Math.min(L / 2, u + bl);
          u += bl;
          if (u1 - u0 < 0.12) continue;
          const mid = (u0 + u1) / 2;
          const top = H * (0.5 + 0.5 * prof(mid / 2.2));
          const y0 = c * course;
          if (y0 > top) continue;
          const partial = y0 + course > top;
          const bh = partial ? Math.max(0.15, top - y0) : course - 0.025;
          const tilt = partial ? (rng.next() - 0.5) * 0.25 : (rng.next() - 0.5) * 0.03;
          fadd(G.cube(u1 - u0 - 0.03, bh, D * (0.94 + rng.next() * 0.08)), rng.next() < 0.3 ? 'stoneDark' : 'stone',
            [mid, y0 + bh / 2, (rng.next() - 0.5) * 0.05], [tilt * 0.3, (rng.next() - 0.5) * 0.04, tilt]);
        }
      }
      // concrete cap beam remnants + rebar in the broken dips
      for (let u = -L / 2 + 0.6; u < L / 2 - 0.6; u += 0.5) {
        const top = H * (0.5 + 0.5 * prof(u / 2.2));
        if (top < H * 0.72 && rng.next() < 0.5) for (let r = 0; r < 2; r++) fadd(G.cyl(0.012, 0.012, 0.35 + rng.next() * 0.4, 4), 'rebar', [u + r * 0.1, top + 0.15, (r - 0.5) * D * 0.5], [(rng.next() - 0.5) * 0.6, 0, (rng.next() - 0.5) * 0.6]);
        if (top > H * 0.85 && rng.next() < 0.35) fadd(G.sph(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 'moss', [u, top - 0.02, 0], [0, 0, 0], [1.2, 0.25, D * 1.6]);
      }
      // industrial pilasters with lamps on the perimeter
      if (perimeter) {
        for (let u = -L / 2 + 1.6; u < L / 2 - 1; u += 4.2) {
          fadd(G.cube(0.36, H * 1.02, D + 0.2), 'panelDark', [u, H * 0.51, 0]);
          fadd(G.cube(0.42, 0.1, D + 0.28), 'trim', [u, H * 1.02, 0]);
          for (const zz of [-1, 1]) {
            fadd(G.cube(0.16, 0.08, 0.06), 'trim', [u, 1.9, zz * (D / 2 + 0.13)]);
            fadd(G.cube(0.1, 0.05, 0.04), 'lampRed', [u, 1.9, zz * (D / 2 + 0.16)]);
          }
          lampWorld(u, 1.9, D / 2 + 0.3, 'red');
        }
        // pipe running along the outside face
        fadd(G.cyl(0.07, 0.07, L, 8), 'panelRust', [0, 0.55, -(D / 2 + 0.12)], [0, 0, Math.PI / 2]);
      }
      // rubble at the base
      for (let i = 0; i < Math.ceil(L * 1.6); i++) {
        const u = (rng.next() - 0.5) * L, side = rng.next() < 0.5 ? -1 : 1;
        fadd(new THREE.DodecahedronGeometry(0.08 + rng.next() * 0.16, 0), rng.next() < 0.5 ? 'stone' : 'stoneDark', [u, 0.05, side * (D / 2 + 0.1 + rng.next() * 0.35)], [rng.next() * 3, rng.next() * 3, rng.next() * 3]);
      }
    } else if (ob.kind === 'cover') {
      const h = H;
      fadd(G.cube(L + 0.06, 0.12, D + 0.14), 'trim', [0, 0.06, 0]);
      // body: chamfered profile extruded along X
      const pd = D / 2, top = h - 0.1;
      const profile: [number, number][] = [[-pd, 0.12], [pd, 0.12], [pd * 0.98, top * 0.55], [pd * 0.62, top], [-pd * 0.62, top], [-pd * 0.98, top * 0.55]];
      fadd(G.prism(profile, L - 0.04, 0.015), 'panel', [0, 0, 0], [0, Math.PI / 2, 0]);
      fadd(G.cube(L, 0.07, D * 0.58), 'panelDark', [0, top + 0.03, 0]);
      fadd(G.cube(L - 0.1, 0.03, D * 0.2), 'trim', [0, top + 0.075, 0]);
      // armour plates + ribs on both faces
      const n = Math.max(2, Math.round(L / 0.85));
      for (let i = 0; i < n; i++) {
        const u = -L / 2 + (i + 0.5) * (L / n);
        for (const zz of [-1, 1]) {
          fadd(G.box(L / n - 0.08, top * 0.42, 0.05, 0.015), i % 3 === 1 ? 'panelRust' : 'panelDark', [u, top * 0.36, zz * (pd + 0.0)], [0, 0, 0]);
          fadd(G.cube(0.04, top * 0.85, 0.06), 'trim', [u - L / n / 2, top * 0.45, zz * pd * 0.9]);
        }
      }
      // glowing strips + lamp anchors
      for (const zz of [-1, 1]) {
        fadd(G.cube(L * 0.86, 0.025, 0.02), 'lampCyan', [0, top * 0.68, zz * (pd * 0.82 + 0.01)], [zz * 0.55, 0, 0]);
        lampWorld(0, top * 0.68, zz * (pd + 0.15), 'cyan');
      }
      // hazard end caps
      for (const ux of [-1, 1]) for (let b = 0; b < 4; b++) fadd(G.cube(0.06, 0.12, D * 0.8), b % 2 ? 'hazard' : 'hazardDark', [ux * (L / 2 - 0.03), 0.24 + b * 0.12, 0]);
      // small console / vent
      fadd(G.box(0.3, 0.16, 0.06, 0.01), 'trim', [L * 0.25, top * 0.6, pd + 0.02]);
      fadd(G.cube(0.22, 0.09, 0.01), 'screen', [L * 0.25, top * 0.6, pd + 0.055]);
    } else if (ob.kind === 'lair') {
      fadd(G.cube(L, 0.15, D + 0.2), 'trim', [0, 0.075, 0]);
      fadd(G.box(L - 0.1, H - 0.15, D, 0.04), 'panelRust', [0, 0.075 + (H - 0.15) / 2, 0]);
      const n = Math.round(L / 0.7);
      for (let i = 0; i <= n; i++) {
        const u = -L / 2 + (i * L) / n;
        for (const zz of [-1, 1]) fadd(G.cube(0.09, H * 0.95, 0.08), 'trim', [u, H * 0.48, zz * (D / 2 + 0.03)]);
      }
      for (const zz of [-1, 1]) for (let b = 0; b < Math.round(L / 0.3); b++) fadd(G.cube(0.3, 0.12, 0.03), b % 2 ? 'hazard' : 'hazardDark', [-L / 2 + 0.15 + b * 0.3, H - 0.25, zz * (D / 2 + 0.02)], [0, 0, 0.6]);
      for (const ux of [-0.7, 0.7]) {
        fadd(G.cyl(0.08, 0.1, 0.12, 10), 'trim', [ux * L / 2, H + 0.06, 0]);
        fadd(G.sph(0.08, 10, 8), 'lampRed', [ux * L / 2, H + 0.16, 0]);
        lampWorld(ux * L / 2, H + 0.3, 0, 'red');
      }
      // spikes / barbed top
      for (let i = 0; i < 9; i++) fadd(G.cone(0.04, 0.3, 5), 'rebar', [-L / 2 + 0.3 + (i * (L - 0.6)) / 8, H + 0.12, 0], [(rng.next() - 0.5) * 0.6, 0, (rng.next() - 0.5) * 0.6]);
    } else if (ob.kind === 'crate') {
      const w = 2 * s.hw, d = 2 * s.hd, h = H;
      const mat = rng.next() < 0.5 ? 'panelRust' : 'panel';
      add(G.box(w - 0.06, h - 0.04, d - 0.06, 0.02), mat, [0, h / 2, 0]);
      const e = 0.07;
      for (const x of [-1, 1]) for (const z of [-1, 1]) add(G.cube(e, h, e), 'trim', [x * (w / 2 - e / 2), h / 2, z * (d / 2 - e / 2)]);
      for (const y of [e / 2, h - e / 2]) { for (const z of [-1, 1]) add(G.cube(w, e, e), 'trim', [0, y, z * (d / 2 - e / 2)]); for (const x of [-1, 1]) add(G.cube(e, e, d), 'trim', [x * (w / 2 - e / 2), y, 0]); }
      add(G.cube(w * 0.9, 0.05, 0.03), 'hazard', [0, h * 0.5, d / 2 + 0.005]);
      add(G.cube(0.18, 0.06, 0.01), 'lampAmber', [w * 0.25, h * 0.75, d / 2 + 0.01]);
      add(G.box(w * 0.5, 0.04, d * 0.5, 0.01), 'panelDark', [0, h + 0.01, 0]);
      grp.rotation.y = 0; // gameplay boxes are axis-aligned
    }
  } else {
    // circles
    const r = s.r, H = ob.height;
    if (ob.kind === 'rock') {
      add(rockGeometry(1, ob.seed), 'rock', [0, H * 0.32, 0], [rng.next() * 0.3, rng.next() * 6, 0], [r * 1.02, H * 0.72, r * 1.02]);
      const nSat = 2 + Math.floor(rng.next() * 3);
      for (let i = 0; i < nSat; i++) {
        const a = rng.next() * Math.PI * 2, rr = r * (0.25 + rng.next() * 0.25);
        add(rockGeometry(1, ob.seed + i + 1, 2), 'rock', [Math.cos(a) * (r * 0.95), rr * 0.4, Math.sin(a) * (r * 0.95)], [rng.next(), rng.next() * 6, 0], [rr, rr * 0.8, rr]);
      }
      add(G.sph(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 'moss', [r * 0.15, H * 0.62, -r * 0.1], [0, 0, 0.15], [r * 0.9, 0.18, r * 0.7]);
    } else if (ob.kind === 'pillar') {
      const geo = new THREE.CylinderGeometry(r * 0.88, r, H, 12, 6, false);
      const p = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const ang = Math.atan2(v.z, v.x);
        const flute = 1 - 0.06 * Math.max(0, Math.cos(ang * 6));
        v.x *= flute; v.z *= flute;
        if (v.y > H / 2 - 1e-3) v.y -= rng.next() * 0.5; // broken top
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      add(geo, 'concrete', [0, H / 2, 0]);
      add(G.cube(r * 2.4, 0.3, r * 2.4), 'stoneDark', [0, 0.15, 0]);
      add(G.cyl(r * 1.02, r * 1.02, 0.12, 12), 'panelDark', [0, H * 0.35, 0]);
      add(G.cyl(r * 1.02, r * 1.02, 0.05, 12), 'lampAmber', [0, H * 0.35 + 0.085, 0]);
      for (let i = 0; i < 5; i++) add(G.cyl(0.014, 0.014, 0.6, 4), 'rebar', [(rng.next() - 0.5) * r, H - 0.1, (rng.next() - 0.5) * r], [(rng.next() - 0.5) * 0.5, 0, (rng.next() - 0.5) * 0.5]);
      lamps.push({ pos: new THREE.Vector3(s.cx, H * 0.35 + 0.1, s.cz), color: 0xffa630, kind: 'amber' });
    }
  }
  k.build();
  return grp;
}

// ------------------------------------------------------------------ decor
function leafGeometry(len: number, width: number, curl: number) {
  const g = new THREE.PlaneGeometry(width, len, 2, 8);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = y / len;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t * 0.3);
    p.setX(i, x * w);
    p.setZ(i, curl * t * t * len + Math.abs(x) * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

export function buildDecor(decor: Decor[], spawns: SpawnPoint[], obstacles: Obstacle[]): THREE.Group {
  const M = envMaterials();
  const grp = new THREE.Group(); grp.name = 'decor';
  const k = new Kit(M);
  const add = (geo: THREE.BufferGeometry, mat: string, pos: V3, rot: V3 = [0, 0, 0], scl: V3 | number = 1) => k.add(grp, geo, mat, pos, rot, scl);
  const grassM: THREE.Matrix4[] = [], pebM: THREE.Matrix4[] = [];
  for (const d of decor) {
    const rng = new Rng(d.seed);
    const sc = d.scale;
    if (d.kind === 'flora') {
      const variant = d.seed % 3;
      if (variant === 0) { // crimson fern
        const n = 6 + Math.floor(rng.next() * 4);
        for (let i = 0; i < n; i++) {
          const a = d.rot + (i / n) * Math.PI * 2 + rng.next() * 0.3;
          add(leafGeometry(0.75 * sc * (0.8 + rng.next() * 0.4), 0.2 * sc, 0.55), 'leafRed', [d.x, 0.02, d.z], [0.55 + rng.next() * 0.35, a, 0]);
        }
        add(G.sph(0.06 * sc, 8, 6), 'bulbPink', [d.x, 0.12 * sc, d.z]);
      } else if (variant === 1) { // glowing bulb stalks
        const n = 3 + Math.floor(rng.next() * 3);
        for (let i = 0; i < n; i++) {
          const a = rng.next() * Math.PI * 2, rr = rng.next() * 0.2, h = (0.4 + rng.next() * 0.5) * sc;
          const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr, tilt = (rng.next() - 0.5) * 0.4;
          add(G.cyl(0.012, 0.022, h, 5), 'stalk', [x, h / 2, z], [tilt, 0, tilt]);
          add(G.sph(0.045 + rng.next() * 0.03, 10, 8), 'bulb', [x + Math.sin(tilt) * h * 0.5, h, z - Math.sin(tilt) * h * 0.5]);
        }
        for (let i = 0; i < 5; i++) add(leafGeometry(0.35 * sc, 0.12 * sc, 0.4), 'leafTeal', [d.x, 0.01, d.z], [1.0, d.rot + i * 1.25, 0]);
      } else { // dark spiky shrub
        const n = 9 + Math.floor(rng.next() * 5);
        for (let i = 0; i < n; i++) add(G.cone(0.035 * sc, (0.5 + rng.next() * 0.4) * sc, 4), 'leafDark', [d.x, 0.2 * sc, d.z], [(rng.next() - 0.5) * 1.4, rng.next() * 6, (rng.next() - 0.5) * 1.4]);
        add(G.sph(0.04, 6, 4), 'bulbPink', [d.x, 0.5 * sc, d.z]);
      }
    } else if (d.kind === 'shroom') {
      const n = 2 + Math.floor(rng.next() * 4);
      for (let i = 0; i < n; i++) {
        const a = rng.next() * 6.28, rr = rng.next() * 0.22, h = (0.08 + rng.next() * 0.2) * sc, cr = (0.05 + rng.next() * 0.07) * sc;
        const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
        add(G.cyl(cr * 0.3, cr * 0.4, h, 6), 'stalk', [x, h / 2, z]);
        add(G.sph(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'shroomCap', [x, h, z], [0, 0, 0], [cr, cr * 0.6, cr]);
      }
    } else if (d.kind === 'grass') {
      grassM.push(new THREE.Matrix4().compose(new THREE.Vector3(d.x, 0, d.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, d.rot, 0)), new THREE.Vector3(sc, sc * (0.7 + rng.next() * 0.6), sc)));
    } else if (d.kind === 'pebble') {
      const s2 = 0.05 + rng.next() * 0.1;
      pebM.push(new THREE.Matrix4().compose(new THREE.Vector3(d.x, s2 * 0.3, d.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.next() * 3, rng.next() * 3, 0)), new THREE.Vector3(s2, s2 * 0.7, s2)));
    } else if (d.kind === 'debris') {
      const v = d.seed % 5;
      if (v === 0) { add(G.cube(0.7 * sc, 0.03, 0.45 * sc), 'panelDark', [d.x, 0.06, d.z], [0.15, d.rot, 0.1]); add(G.cube(0.35 * sc, 0.03, 0.45 * sc), 'panelDark', [d.x + 0.3, 0.14, d.z], [0.0, d.rot, 0.6]); }
      else if (v === 1) { add(G.cyl(0.07, 0.07, 1.1 * sc, 8), 'panelRust', [d.x, 0.07, d.z], [0, d.rot, Math.PI / 2]); add(G.torus(0.08, 0.02, 5, 10), 'trim', [d.x + 0.4 * Math.cos(d.rot), 0.07, d.z - 0.4 * Math.sin(d.rot)], [0, d.rot + Math.PI / 2, 0]); }
      else if (v === 2) { for (let i = 0; i < 4; i++) add(new THREE.DodecahedronGeometry(0.08 + rng.next() * 0.12, 0), 'concrete', [d.x + (rng.next() - 0.5) * 0.6, 0.06, d.z + (rng.next() - 0.5) * 0.6], [rng.next() * 3, rng.next() * 3, 0]); }
      else if (v === 3) { add(G.torus(0.22 * sc, 0.022, 5, 18), 'cable', [d.x, 0.03, d.z], [Math.PI / 2, 0, 0]); add(G.torus(0.17 * sc, 0.022, 5, 18), 'cable', [d.x + 0.05, 0.06, d.z], [Math.PI / 2, 0, 0]); }
      else { add(G.box(0.5 * sc, 0.25, 0.3 * sc, 0.02), 'panel', [d.x, 0.1, d.z], [0.3, d.rot, 0.2]); add(G.cube(0.16, 0.05, 0.01), 'screen', [d.x, 0.2, d.z], [0.3, d.rot, 0.2]); }
    }
  }
  // hive growth around the lairs (monster origin)
  for (const sp of spawns) {
    const rng = new Rng(sp.x * 100 + sp.z);
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * 6.28, r = 0.8 + rng.next() * 1.6, s2 = 0.15 + rng.next() * 0.35;
      add(G.sph(1, 7, 5), 'hive', [sp.x + Math.cos(a) * r, 0, sp.z + Math.sin(a) * r], [0, rng.next() * 6, 0], [s2 * 1.6, s2 * 0.45, s2 * 1.1]);
      if (rng.next() < 0.5) add(G.sph(0.04 + rng.next() * 0.04, 8, 6), 'hiveGlow', [sp.x + Math.cos(a) * r, s2 * 0.4, sp.z + Math.sin(a) * r]);
      if (rng.next() < 0.5) add(G.horn(0.3 + rng.next() * 0.3, 0.035, 0.15, 5, 5), 'hive', [sp.x + Math.cos(a) * r, 0, sp.z + Math.sin(a) * r], [0.3, rng.next() * 6, 0]);
    }
  }
  k.build({ castShadow: true });
  // instanced grass tufts
  const blades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 6; b++) {
    const bl = new THREE.BufferGeometry();
    const a = (b / 6) * Math.PI * 2, h = 0.22 + (b % 3) * 0.08, lean = 0.12;
    const cx = Math.cos(a) * 0.04, cz = Math.sin(a) * 0.04;
    bl.setAttribute('position', new THREE.Float32BufferAttribute([cx - 0.02 * Math.sin(a), 0, cz + 0.02 * Math.cos(a), cx + 0.02 * Math.sin(a), 0, cz - 0.02 * Math.cos(a), cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean], 3));
    bl.computeVertexNormals();
    blades.push(bl);
  }
  const { mergeGeometries } = THREE as any;
  void mergeGeometries;
  const tuft = mergeBlades(blades);
  const grass = new THREE.InstancedMesh(tuft, M.grass, grassM.length);
  grassM.forEach((m, i) => grass.setMatrixAt(i, m));
  grass.receiveShadow = true; grp.add(grass);
  const peb = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M.rock, pebM.length);
  pebM.forEach((m, i) => peb.setMatrixAt(i, m));
  peb.castShadow = peb.receiveShadow = true; grp.add(peb);
  void obstacles;
  return grp;
}

function mergeBlades(bs: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  for (const b of bs) pos.push(...(b.attributes.position.array as Float32Array));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ ground + backdrop
export function buildGround(): THREE.Group {
  const grp = new THREE.Group(); grp.name = 'groundGroup';
  const size = CFG.navHalf * 2 + 6;
  const t = groundTexture(size, CFG.arenaHalf);
  const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0.15 });
  mat.normalScale.set(0.7, 0.7);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'ground';
  grp.add(ground);
  // outer soil (beyond the textured play area)
  const outer = new THREE.Mesh(new THREE.RingGeometry(size * 0.5, 120, 4, 1, Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0x1b1814, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.01; outer.scale.setScalar(Math.SQRT2); outer.receiveShadow = true;
  grp.add(outer);
  return grp;
}

/** Large silhouettes outside the arena so the play space reads as part of a ruined outpost. */
export function buildBackdrop(lamps: LampAnchor[]): THREE.Group {
  const M = envMaterials();
  const grp = new THREE.Group(); grp.name = 'backdrop';
  const k = new Kit(M);
  const rng = new Rng(4242);
  const add = (geo: THREE.BufferGeometry, mat: string, pos: V3, rot: V3 = [0, 0, 0], scl: V3 | number = 1) => k.add(grp, geo, mat, pos, rot, scl);
  const R = CFG.navHalf;
  // rocky ridge ring
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rng.next() * 0.05;
    const d = R + 1.5 + rng.next() * 4;
    const x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 1.05;
    if (Math.max(Math.abs(x), Math.abs(z)) < R + 0.8) continue;
    const r = 1.2 + rng.next() * 2.2;
    add(rockGeometry(1, 500 + i, 2), 'rock', [x, r * 0.3, z], [rng.next(), rng.next() * 6, 0], [r, r * (0.7 + rng.next() * 0.9), r]);
  }
  // ruined industrial blocks in the corners
  const blocks: [number, number, number, number, number][] = [[-22, -22, 5, 4, 6], [22, -21, 4, 6, 5], [21, 22, 6, 3.5, 4], [-22, 21, 4, 5, 6]];
  for (const [x, z, w, h, d] of blocks) {
    add(G.cube(w, h, d), 'panelDark', [x, h / 2, z]);
    add(G.cube(w + 0.2, 0.2, d + 0.2), 'trim', [x, h, z]);
    for (let i = 0; i < 4; i++) add(G.cube(0.25, h + 0.4, 0.25), 'trim', [x + (i % 2 ? 1 : -1) * w / 2, (h + 0.4) / 2, z + (i < 2 ? 1 : -1) * d / 2]);
    for (let i = 0; i < 3; i++) add(G.cube(w * 0.25, 0.25, 0.04), 'lampAmber', [x - w * 0.3 + i * w * 0.3, h * 0.6, z + d / 2 + 0.02]);
    add(G.cyl(0.35, 0.35, h * 1.6, 10), 'panelRust', [x + w * 0.3, h * 0.8, z - d * 0.2]);
    add(G.sph(0.15, 8, 6), 'lampRed', [x + w * 0.3, h * 1.6 + 0.2, z - d * 0.2]);
    lamps.push({ pos: new THREE.Vector3(x + w * 0.3, h * 1.6 + 0.3, z - d * 0.2), color: 0xff2a1a, kind: 'red' });
    lamps.push({ pos: new THREE.Vector3(x, h * 0.6, z + d / 2 + 0.6), color: 0xffa630, kind: 'amber' });
  }
  // pipes along two sides
  for (const zz of [-1, 1]) {
    add(G.cyl(0.25, 0.25, 40, 10), 'panelRust', [0, 0.5, zz * (R + 0.9)], [0, 0, Math.PI / 2]);
    for (let x = -18; x <= 18; x += 4) add(G.cube(0.5, 0.8, 0.6), 'trim', [x, 0.4, zz * (R + 0.9)]);
  }
  k.build({ castShadow: true });
  return grp;
}

export function contactShadow(radius: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.6)'), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.015; m.renderOrder = 1;
  return m;
}
