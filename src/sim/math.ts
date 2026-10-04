// Small 2D math kit for the ground plane (x, z). Pure functions, no allocations in hot paths where avoidable.

export interface V2 { x: number; z: number }

export const v2 = (x: number, z: number): V2 => ({ x, z });
export const len = (x: number, z: number) => Math.hypot(x, z);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Wrap angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

export interface Box { kind: 'box'; cx: number; cz: number; hw: number; hd: number }
export interface Circle { kind: 'circle'; cx: number; cz: number; r: number }
export type Shape = Box | Circle;

/** Ray (origin o, unit dir d) vs axis-aligned box. Returns entry distance t>=0 or -1. */
export function rayBox(ox: number, oz: number, dx: number, dz: number, b: Box, inflate = 0): number {
  const minX = b.cx - b.hw - inflate, maxX = b.cx + b.hw + inflate;
  const minZ = b.cz - b.hd - inflate, maxZ = b.cz + b.hd + inflate;
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-12) {
    if (ox < minX || ox > maxX) return -1;
  } else {
    const t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  if (Math.abs(dz) < 1e-12) {
    if (oz < minZ || oz > maxZ) return -1;
  } else {
    const t1 = (minZ - oz) / dz, t2 = (maxZ - oz) / dz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  if (tmax < 0 || tmin > tmax) return -1;
  return tmin < 0 ? 0 : tmin; // origin inside -> 0
}

/** Ray vs circle. Returns entry distance t>=0 or -1. */
export function rayCircle(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const fx = ox - cx, fz = oz - cz;
  const b = fx * dx + fz * dz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0; // inside
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

export function rayShape(ox: number, oz: number, dx: number, dz: number, s: Shape, inflate = 0): number {
  return s.kind === 'box' ? rayBox(ox, oz, dx, dz, s, inflate) : rayCircle(ox, oz, dx, dz, s.cx, s.cz, s.r + inflate);
}

export function pointInShape(x: number, z: number, s: Shape, inflate = 0): boolean {
  if (s.kind === 'box') return Math.abs(x - s.cx) <= s.hw + inflate && Math.abs(z - s.cz) <= s.hd + inflate;
  const dx = x - s.cx, dz = z - s.cz, r = s.r + inflate;
  return dx * dx + dz * dz <= r * r;
}

/** Push a circle (p, r) out of shape s. Returns true if moved. Mutates p. */
export function pushOut(p: V2, r: number, s: Shape): boolean {
  if (s.kind === 'circle') {
    const dx = p.x - s.cx, dz = p.z - s.cz;
    const d = Math.hypot(dx, dz), min = r + s.r;
    if (d >= min) return false;
    const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
    p.x = s.cx + nx * min; p.z = s.cz + nz * min;
    return true;
  }
  const qx = clamp(p.x, s.cx - s.hw, s.cx + s.hw);
  const qz = clamp(p.z, s.cz - s.hd, s.cz + s.hd);
  const dx = p.x - qx, dz = p.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x = qx + (dx / d) * r; p.z = qz + (dz / d) * r;
    return true;
  }
  // centre inside the box: push along the axis of least penetration
  const px = s.hw + r - Math.abs(p.x - s.cx);
  const pz = s.hd + r - Math.abs(p.z - s.cz);
  if (px < pz) p.x = s.cx + Math.sign(p.x - s.cx || 1) * (s.hw + r);
  else p.z = s.cz + Math.sign(p.z - s.cz || 1) * (s.hd + r);
  return true;
}
