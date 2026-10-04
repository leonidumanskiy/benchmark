// Gameplay visibility: near circle + aim sector with line-of-sight. Pure function; renderer only consumes its verdicts.
import { CFG } from './config';
import { Obstacle } from './arena';
import { rayShape, wrapAngle } from './math';

export type VisReason =
  | 'near' // inside the near awareness circle
  | 'sector_clear' // inside aim sector, in range, clear line of sight
  | 'out_of_sector'
  | 'out_of_range'
  | 'occluded';

export interface VisResult {
  visible: boolean;
  reason: VisReason;
  occluder: string | null;
  dist: number;
  /** absolute angle between aim direction and target, degrees */
  angleDeg: number;
}

/** First sight-blocking obstacle on the segment from (ax,az) to (bx,bz), or null. */
export function firstBlocker(obstacles: Obstacle[], ax: number, az: number, bx: number, bz: number): { id: string; t: number } | null {
  const dx = bx - ax, dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return null;
  const ux = dx / d, uz = dz / d;
  let best: { id: string; t: number } | null = null;
  for (const ob of obstacles) {
    const t = rayShape(ax, az, ux, uz, ob.shape);
    if (t >= 0 && t < d && (!best || t < best.t)) best = { id: ob.id, t };
  }
  return best;
}

export function computeVisibility(
  obstacles: Obstacle[], px: number, pz: number, aimAngle: number, tx: number, tz: number,
): VisResult {
  const V = CFG.vision;
  const dx = tx - px, dz = tz - pz;
  const dist = Math.hypot(dx, dz);
  const ang = Math.abs(wrapAngle(Math.atan2(dz, dx) - aimAngle));
  const angleDeg = (ang * 180) / Math.PI;
  if (dist <= V.nearRadius) return { visible: true, reason: 'near', occluder: null, dist, angleDeg };
  // boundary is inclusive: a target exactly on the sector edge is visible (rounded to 1e-9 to avoid float noise)
  if (angleDeg > V.sectorHalfAngleDeg + 1e-9) return { visible: false, reason: 'out_of_sector', occluder: null, dist, angleDeg };
  if (dist > V.range) return { visible: false, reason: 'out_of_range', occluder: null, dist, angleDeg };
  const b = firstBlocker(obstacles, px, pz, tx, tz);
  if (b) return { visible: false, reason: 'occluded', occluder: b.id, dist, angleDeg };
  return { visible: true, reason: 'sector_clear', occluder: null, dist, angleDeg };
}

/** Visibility polygon of the aim sector (for overlays / light masks): list of [x,z] points, origin first. */
export function sectorPolygon(obstacles: Obstacle[], px: number, pz: number, aimAngle: number, rays = 64): [number, number][] {
  const V = CFG.vision;
  const half = (V.sectorHalfAngleDeg * Math.PI) / 180;
  const pts: [number, number][] = [[px, pz]];
  for (let i = 0; i <= rays; i++) {
    const a = aimAngle - half + (2 * half * i) / rays;
    const ux = Math.cos(a), uz = Math.sin(a);
    let t = V.range;
    for (const ob of obstacles) {
      const h = rayShape(px, pz, ux, uz, ob.shape);
      if (h >= 0 && h < t) t = h;
    }
    pts.push([px + ux * t, pz + uz * t]);
  }
  return pts;
}
