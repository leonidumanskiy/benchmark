// Arena layout: single source of truth for gameplay collision / sight / shots AND for scene dressing.
import { Shape, pointInShape } from './math';
import { CFG } from './config';
import { Rng } from './rng';

export type ObstacleKind = 'wall' | 'cover' | 'rock' | 'crate' | 'pillar' | 'lair';
export type Material = 'metal' | 'stone';

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  material: Material;
  shape: Shape;
  height: number;
  /** seed for visual variation */
  seed: number;
}

export interface Decor {
  id: string;
  kind: 'flora' | 'grass' | 'debris' | 'pebble' | 'shroom';
  x: number; z: number; rot: number; scale: number; seed: number;
}

export interface SpawnPoint { id: string; x: number; z: number; lair: string }

const H = CFG.arenaHalf;
const T = 0.4; // half thickness of perimeter walls

function box(id: string, kind: ObstacleKind, material: Material, cx: number, cz: number, hw: number, hd: number, height: number, seed = 0): Obstacle {
  return { id, kind, material, shape: { kind: 'box', cx, cz, hw, hd }, height, seed };
}
function circ(id: string, kind: ObstacleKind, material: Material, cx: number, cz: number, r: number, height: number, seed = 0): Obstacle {
  return { id, kind, material, shape: { kind: 'circle', cx, cz, r }, height, seed };
}

export function buildArena(): { obstacles: Obstacle[]; spawns: SpawnPoint[]; decor: Decor[] } {
  const o: Obstacle[] = [];
  const gap = 2.2; // half-width of the entrance in the middle of each side
  const segHalf = (H + T * 2 - gap) / 2;
  const segC = gap + segHalf;
  // perimeter (ruined stone walls) with an entrance on every side
  o.push(box('wall_n_w', 'wall', 'stone', -segC, -H - T, segHalf, T, 2.6, 1));
  o.push(box('wall_n_e', 'wall', 'stone', segC, -H - T, segHalf, T, 2.4, 2));
  o.push(box('wall_s_w', 'wall', 'stone', -segC, H + T, segHalf, T, 2.5, 3));
  o.push(box('wall_s_e', 'wall', 'stone', segC, H + T, segHalf, T, 2.7, 4));
  o.push(box('wall_w_n', 'wall', 'stone', -H - T, -segC, T, segHalf, 2.5, 5));
  o.push(box('wall_w_s', 'wall', 'stone', -H - T, segC, T, segHalf, 2.6, 6));
  o.push(box('wall_e_n', 'wall', 'stone', H + T, -segC, T, segHalf, 2.4, 7));
  o.push(box('wall_e_s', 'wall', 'stone', H + T, segC, T, segHalf, 2.6, 8));

  // spawn lair covers: monsters appear behind these, walk around them and through the entrance
  o.push(box('lair_n', 'lair', 'metal', 0, -19.2, 2.8, 0.5, 1.4, 11));
  o.push(box('lair_s', 'lair', 'metal', 0, 19.2, 2.8, 0.5, 1.4, 12));
  o.push(box('lair_w', 'lair', 'metal', -19.2, 0, 0.5, 2.8, 1.4, 13));
  o.push(box('lair_e', 'lair', 'metal', 19.2, 0, 0.5, 2.8, 1.4, 14));

  // interior sci-fi covers (metal)
  o.push(box('cover_a', 'cover', 'metal', -6, -5, 1.7, 0.45, 1.15, 21));
  o.push(box('cover_b', 'cover', 'metal', 6.5, -6, 0.45, 1.7, 1.15, 22));
  o.push(box('cover_c', 'cover', 'metal', -7, 6, 0.45, 1.8, 1.15, 23));
  o.push(box('cover_d', 'cover', 'metal', 7, 6.5, 1.7, 0.45, 1.15, 24));
  o.push(box('cover_e', 'cover', 'metal', 0, -10.5, 2.4, 0.45, 1.15, 25));
  o.push(box('cover_f', 'cover', 'metal', -1, 11, 2.2, 0.45, 1.15, 26));

  // ruined stone walls inside
  o.push(box('ruin_1a', 'wall', 'stone', -11.5, -10, 2.2, 0.4, 2.2, 31));
  o.push(box('ruin_1b', 'wall', 'stone', -13.3, -8.0, 0.4, 1.6, 1.6, 32));
  o.push(box('ruin_2', 'wall', 'stone', 11, 10.5, 0.4, 2.3, 2.0, 33));
  o.push(box('ruin_3', 'wall', 'stone', 12, -9, 1.8, 0.4, 1.8, 34));

  // rocks
  o.push(circ('rock_1', 'rock', 'stone', -11, 1, 1.3, 1.6, 41));
  o.push(circ('rock_2', 'rock', 'stone', 11.5, 1.5, 1.15, 1.4, 42));
  o.push(circ('rock_3', 'rock', 'stone', 4.5, 12.5, 1.0, 1.2, 43));
  o.push(circ('rock_4', 'rock', 'stone', -12, 12, 1.4, 1.7, 44));
  o.push(circ('rock_5', 'rock', 'stone', -4.5, -13.2, 0.9, 1.1, 45));
  o.push(circ('rock_6', 'rock', 'stone', 13.2, -13.2, 1.0, 1.3, 46));

  // crates (metal)
  o.push(box('crate_1', 'crate', 'metal', 3.2, -2.8, 0.55, 0.55, 1.0, 51));
  o.push(box('crate_2', 'crate', 'metal', -3.8, 3.2, 0.5, 0.5, 0.95, 52));
  o.push(box('crate_3', 'crate', 'metal', 9.5, -12.5, 0.6, 0.6, 1.1, 53));

  // broken pillars
  o.push(circ('pillar_1', 'pillar', 'stone', -10, 4.6, 0.55, 3.2, 61));
  o.push(circ('pillar_2', 'pillar', 'stone', 10, -4, 0.55, 2.4, 62));

  const spawns: SpawnPoint[] = [
    { id: 'sp_n1', x: -2.6, z: -21.2, lair: 'lair_n' }, { id: 'sp_n2', x: 2.6, z: -21.2, lair: 'lair_n' },
    { id: 'sp_e1', x: 21.2, z: -2.6, lair: 'lair_e' }, { id: 'sp_e2', x: 21.2, z: 2.6, lair: 'lair_e' },
    { id: 'sp_s1', x: 2.6, z: 21.2, lair: 'lair_s' }, { id: 'sp_s2', x: -2.6, z: 21.2, lair: 'lair_s' },
    { id: 'sp_w1', x: -21.2, z: 2.6, lair: 'lair_w' }, { id: 'sp_w2', x: -21.2, z: -2.6, lair: 'lair_w' },
  ];

  // decorative, non-blocking dressing (deterministic)
  const rng = new Rng(1337);
  const decor: Decor[] = [];
  const free = (x: number, z: number, pad: number) => !o.some((ob) => pointInShape(x, z, ob.shape, pad));
  const place = (kind: Decor['kind'], n: number, half: number, pad: number, nearObstacles: boolean) => {
    let tries = 0;
    while (n > 0 && tries++ < 4000) {
      let x: number, z: number;
      if (nearObstacles && rng.next() < 0.75) {
        // cluster around obstacle bases so props feel grounded in the environment
        const ob = o[Math.floor(rng.next() * o.length)];
        const s = ob.shape;
        const ext = s.kind === 'box' ? Math.max(s.hw, s.hd) : s.r;
        const a = rng.next() * Math.PI * 2, d = ext + 0.3 + rng.next() * 1.4;
        x = s.cx + Math.cos(a) * d; z = s.cz + Math.sin(a) * d;
      } else {
        x = (rng.next() * 2 - 1) * half; z = (rng.next() * 2 - 1) * half;
      }
      if (Math.abs(x) > half || Math.abs(z) > half) continue;
      if (!free(x, z, pad)) continue;
      decor.push({ id: `${kind}_${decor.length}`, kind, x, z, rot: rng.next() * Math.PI * 2, scale: 0.7 + rng.next() * 0.6, seed: Math.floor(rng.next() * 1e6) });
      n--;
    }
  };
  place('flora', 26, H + 5, 0.25, true);
  place('shroom', 18, H + 5, 0.15, true);
  place('grass', 70, H + 5, 0.1, true);
  place('debris', 26, H - 0.5, 0.2, true);
  place('pebble', 60, H + 5, 0.05, false);
  return { obstacles: o, spawns, decor };
}
