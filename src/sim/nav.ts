// Grid navigation: obstacles inflated by monster radius, A* with octile heuristic + string pulling.
import { CFG } from './config';
import { Obstacle } from './arena';
import { pointInShape, V2 } from './math';

export class NavGrid {
  readonly half = CFG.navHalf;
  readonly cell = CFG.navCell;
  readonly n: number;
  readonly blocked: Uint8Array;

  constructor(obstacles: Obstacle[], inflate: number) {
    this.n = Math.round((this.half * 2) / this.cell);
    this.blocked = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const { x, z } = this.center(i, j);
        const edge = this.half - Math.abs(x) < inflate + 0.2 || this.half - Math.abs(z) < inflate + 0.2;
        let b = edge;
        if (!b) for (const ob of obstacles) if (pointInShape(x, z, ob.shape, inflate)) { b = true; break; }
        this.blocked[j * this.n + i] = b ? 1 : 0;
      }
    }
  }

  center(i: number, j: number): V2 { return { x: -this.half + (i + 0.5) * this.cell, z: -this.half + (j + 0.5) * this.cell }; }
  cellOf(x: number, z: number): [number, number] {
    const i = Math.floor((x + this.half) / this.cell), j = Math.floor((z + this.half) / this.cell);
    return [Math.min(this.n - 1, Math.max(0, i)), Math.min(this.n - 1, Math.max(0, j))];
  }
  isBlocked(i: number, j: number) { return i < 0 || j < 0 || i >= this.n || j >= this.n || this.blocked[j * this.n + i] === 1; }
  walkable(x: number, z: number) { const [i, j] = this.cellOf(x, z); return !this.isBlocked(i, j); }

  /** Segment is walkable if every sample along it lies in free cells. */
  segmentClear(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!this.walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  private nearestFree(i: number, j: number): [number, number] {
    if (!this.isBlocked(i, j)) return [i, j];
    for (let r = 1; r < 12; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++)
          if ((Math.abs(di) === r || Math.abs(dj) === r) && !this.isBlocked(i + di, j + dj)) return [i + di, j + dj];
    return [i, j];
  }

  /** Returns world waypoints from a to b (excluding start), smoothed. Empty if no path. */
  findPath(a: V2, b: V2): V2[] {
    const n = this.n;
    let [si, sj] = this.nearestFree(...this.cellOf(a.x, a.z));
    let [gi, gj] = this.nearestFree(...this.cellOf(b.x, b.z));
    const start = sj * n + si, goal = gj * n + gi;
    if (start === goal) return [{ x: b.x, z: b.z }];
    const g = new Float32Array(n * n).fill(Infinity);
    const came = new Int32Array(n * n).fill(-1);
    const closed = new Uint8Array(n * n);
    const heap: number[] = []; const f: number[] = [];
    const push = (node: number, fv: number) => {
      heap.push(node); f.push(fv);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (f[p] <= f[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [f[p], f[k]] = [f[k], f[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0]; const last = heap.pop()!; const lf = f.pop()!;
      if (heap.length) {
        heap[0] = last; f[0] = lf; let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < heap.length && f[l] < f[m]) m = l;
          if (r < heap.length && f[r] < f[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; [f[m], f[k]] = [f[k], f[m]]; k = m;
        }
      }
      return top;
    };
    const h = (i: number, j: number) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    g[start] = 0; push(start, h(si, sj));
    let found = false, iter = 0;
    while (heap.length && iter++ < 20000) {
      const cur = pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % n, cj = (cur / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (this.isBlocked(ni, nj)) continue;
        if (di && dj && (this.isBlocked(ci + di, cj) || this.isBlocked(ci, cj + dj))) continue; // no corner cutting
        const nb = nj * n + ni;
        const ng = g[cur] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nb]) { g[nb] = ng; came[nb] = cur; push(nb, ng + h(ni, nj)); }
      }
    }
    if (!found) return [];
    const cells: V2[] = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) cells.push(this.center(c % n, (c / n) | 0));
    cells.reverse();
    cells[cells.length - 1] = { x: b.x, z: b.z };
    // string pulling
    const out: V2[] = [];
    let ax = a.x, az = a.z, k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) if (this.segmentClear(ax, az, cells[m].x, cells[m].z)) { far = m; break; }
      out.push(cells[far]); ax = cells[far].x; az = cells[far].z; k = far + 1;
    }
    return out;
  }
}
