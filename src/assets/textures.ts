// Procedural textures generated at load time from seeded noise + Canvas2D drawing (fast, reproducible, editable in code).
import * as THREE from 'three';
import { Rng } from '../sim/rng';

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h = w) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: true })! };
}

/** Tileable value-noise tile (grayscale) used as a pattern for detail layers. */
export function noiseTile(size = 256, seed = 1, octaves = 5): HTMLCanvasElement {
  const { c, g } = canvas(size);
  const img = g.createImageData(size, size);
  const rng = new Rng(seed);
  const acc = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array(cells * cells).map(() => rng.next());
    const step = size / cells;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / step, gy = y / step;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = grid[(y0 % cells) * cells + (x0 % cells)], b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c2 = grid[((y0 + 1) % cells) * cells + (x0 % cells)], d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      acc[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c2 + (d - c2) * sx) * sy);
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((acc[i] / tot) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Sobel normal map from a grayscale height canvas. */
export function heightToNormal(src: HTMLCanvasElement, strength = 2): HTMLCanvasElement {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const { c, g } = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x: number, y: number) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    out.data[i] = (nx * 0.5 + 0.5) * 255; out.data[i + 1] = (ny * 0.5 + 0.5) * 255; out.data[i + 2] = (nz * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export interface PBRSet { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }

function pbrFrom(key: string, size: number, draw: (g: CanvasRenderingContext2D, hg: CanvasRenderingContext2D, rg: CanvasRenderingContext2D, size: number) => void, normalStrength = 2): PBRSet {
  if (cache.has(key + ':map')) return { map: cache.get(key + ':map')!, normalMap: cache.get(key + ':n')!, roughnessMap: cache.get(key + ':r')! };
  const A = canvas(size), Hc = canvas(size), R = canvas(size);
  draw(A.g, Hc.g, R.g, size);
  const set = { map: tex(A.c, true), normalMap: tex(heightToNormal(Hc.c, normalStrength), false), roughnessMap: tex(R.c, false) };
  cache.set(key + ':map', set.map); cache.set(key + ':n', set.normalMap); cache.set(key + ':r', set.roughnessMap);
  return set;
}

function overlayNoise(g: CanvasRenderingContext2D, tile: HTMLCanvasElement, scale: number, alpha: number, op: GlobalCompositeOperation, size: number) {
  g.save();
  g.globalAlpha = alpha; g.globalCompositeOperation = op;
  const p = g.createPattern(tile, 'repeat')!;
  p.setTransform(new DOMMatrix().scale(scale));
  g.fillStyle = p; g.fillRect(0, 0, size, size);
  g.restore();
}

/** Painted sci-fi metal: panel seams, bolts, scratches, edge wear. Tileable. */
export function metalPanels(seed = 3, tint = '#3a4048', panel = 4): PBRSet {
  return pbrFrom(`metal:${seed}:${tint}:${panel}`, 512, (g, hg, rg, S) => {
    const rng = new Rng(seed);
    const n1 = noiseTile(256, seed, 6), n2 = noiseTile(128, seed + 7, 4);
    g.fillStyle = tint; g.fillRect(0, 0, S, S);
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
    rg.fillStyle = '#8a8a8a'; rg.fillRect(0, 0, S, S);
    const cell = S / panel;
    for (let j = 0; j < panel; j++) for (let i = 0; i < panel; i++) {
      const sub = rng.next() < 0.3;
      const x = i * cell, y = j * cell;
      const shade = (rng.next() - 0.5) * 18;
      g.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${Math.abs(shade) / 255})`;
      g.fillRect(x, y, cell, cell);
      // seams
      hg.strokeStyle = '#303030'; hg.lineWidth = 3; hg.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
      if (sub) { hg.fillStyle = '#9a9a9a'; hg.fillRect(x + cell * 0.2, y + cell * 0.2, cell * 0.6, cell * 0.6); g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + cell * 0.2, y + cell * 0.2, cell * 0.6, cell * 0.6); }
      // bolts
      for (const [bx, by] of [[6, 6], [cell - 6, 6], [6, cell - 6], [cell - 6, cell - 6]]) {
        g.fillStyle = 'rgba(200,210,220,0.35)'; g.beginPath(); g.arc(x + bx, y + by, 2, 0, 7); g.fill();
        hg.fillStyle = '#c0c0c0'; hg.beginPath(); hg.arc(x + bx, y + by, 2.2, 0, 7); hg.fill();
      }
    }
    overlayNoise(g, n1, 2, 0.35, 'multiply', S);
    overlayNoise(g, n2, 1, 0.12, 'overlay', S);
    // scratches + edge wear
    for (let k = 0; k < 140; k++) {
      const x = rng.next() * S, y = rng.next() * S, a = rng.next() * Math.PI, l = 4 + rng.next() * 22;
      g.strokeStyle = `rgba(190,200,210,${0.06 + rng.next() * 0.12})`; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      rg.strokeStyle = 'rgba(40,40,40,0.5)'; rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); rg.stroke();
    }
    overlayNoise(hg, n1, 2, 0.25, 'overlay', S);
    overlayNoise(rg, n1, 1, 0.5, 'overlay', S);
  }, 3);
}

/** Rough stone / concrete blocks for ruined walls. */
export function stoneBlocks(seed = 5): PBRSet {
  return pbrFrom(`stone:${seed}`, 512, (g, hg, rg, S) => {
    const rng = new Rng(seed);
    const n1 = noiseTile(256, seed, 6), n2 = noiseTile(64, seed + 3, 3);
    g.fillStyle = '#5d5a55'; g.fillRect(0, 0, S, S);
    hg.fillStyle = '#7a7a7a'; hg.fillRect(0, 0, S, S);
    rg.fillStyle = '#e0e0e0'; rg.fillRect(0, 0, S, S);
    const rows = 6, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -rh * 0.7 : 0;
      while (x < S) {
        const w = rh * (1.2 + rng.next() * 1.2);
        const v = 70 + rng.next() * 30;
        g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`;
        g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
        hg.fillStyle = `rgb(${150 + rng.next() * 40},${150},${150})`; hg.fillRect(x + 3, r * rh + 3, w - 6, rh - 6);
        x += w;
      }
    }
    overlayNoise(g, n1, 2, 0.45, 'multiply', S);
    overlayNoise(g, n2, 3, 0.2, 'overlay', S);
    overlayNoise(hg, n1, 2, 0.5, 'overlay', S);
    overlayNoise(hg, n2, 4, 0.35, 'overlay', S);
    // cracks
    for (let k = 0; k < 30; k++) {
      let x = rng.next() * S, y = rng.next() * S;
      g.strokeStyle = 'rgba(20,18,16,0.6)'; hg.strokeStyle = '#202020'; g.lineWidth = hg.lineWidth = 1.2;
      g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rng.next() - 0.5) * 20; y += (rng.next() - 0.3) * 14; g.lineTo(x, y); hg.lineTo(x, y); }
      g.stroke(); hg.stroke();
    }
  }, 4);
}

/** Natural rock: layered, speckled. */
export function rockTexture(seed = 9): PBRSet {
  return pbrFrom(`rock:${seed}`, 512, (g, hg, rg, S) => {
    const n1 = noiseTile(256, seed, 7), n2 = noiseTile(128, seed + 1, 5);
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#6b6259'); grd.addColorStop(0.5, '#4e4842'); grd.addColorStop(1, '#5c544c');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    overlayNoise(g, n1, 2, 0.6, 'multiply', S);
    overlayNoise(g, n2, 4, 0.3, 'overlay', S);
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(30,26,22,${0.08 + (i % 3) * 0.04})`; g.fillRect(0, (i / 18) * S + Math.sin(i) * 6, S, 3); }
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
    overlayNoise(hg, n1, 2, 0.9, 'source-over', S);
    overlayNoise(hg, n2, 4, 0.4, 'overlay', S);
    rg.fillStyle = '#d8d8d8'; rg.fillRect(0, 0, S, S);
    overlayNoise(rg, n2, 2, 0.3, 'overlay', S);
  }, 5);
}

/** Chitin / carapace for the monster. */
export function chitinTexture(seed = 13): PBRSet {
  return pbrFrom(`chitin:${seed}`, 512, (g, hg, rg, S) => {
    const rng = new Rng(seed);
    const n1 = noiseTile(256, seed, 6);
    g.fillStyle = '#c4c9d1'; g.fillRect(0, 0, S, S);
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
    rg.fillStyle = '#6a6a6a'; rg.fillRect(0, 0, S, S);
    // overlapping scale plates
    for (let k = 0; k < 90; k++) {
      const x = rng.next() * S, y = rng.next() * S, r = 30 + rng.next() * 50;
      const gr = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.8, 'rgba(120,126,136,0.15)'); gr.addColorStop(1, 'rgba(30,30,36,0.55)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, 7); g.fill();
      const hr = hg.createRadialGradient(x, y, 0, x, y, r);
      hr.addColorStop(0, '#b0b0b0'); hr.addColorStop(1, '#505050');
      hg.fillStyle = hr; hg.beginPath(); hg.ellipse(x, y, r, r * 0.7, 0, 0, 7); hg.fill();
    }
    // glowing red veins (albedo only; emissive handled separately)
    for (let k = 0; k < 26; k++) {
      let x = rng.next() * S, y = rng.next() * S;
      g.strokeStyle = 'rgba(170,20,25,0.55)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 8; s++) { x += (rng.next() - 0.5) * 26; y += (rng.next() - 0.5) * 26; g.lineTo(x, y); }
      g.stroke();
    }
    overlayNoise(g, n1, 2, 0.2, 'multiply', S);
    overlayNoise(rg, n1, 2, 0.4, 'overlay', S);
  }, 3);
}

/** Large ground texture covering the whole playfield (deck plates inside the arena, rocky soil outside). */
export function groundTexture(worldSize: number, arenaHalf: number, seed = 21): PBRSet & { emissiveMap: THREE.Texture } {
  const S = 2048;
  const key = `ground:${seed}`;
  const set = pbrFrom(key, S, (g, hg, rg, size) => {
    const rng = new Rng(seed);
    const px = size / worldSize; // pixels per metre
    const W = (x: number) => (x + worldSize / 2) * px; // world -> px
    const n1 = noiseTile(256, seed, 7), n2 = noiseTile(256, seed + 5, 5), n3 = noiseTile(64, seed + 9, 3);
    // soil base
    g.fillStyle = '#3a342e'; g.fillRect(0, 0, size, size);
    overlayNoise(g, n1, 6, 0.65, 'multiply', size);
    overlayNoise(g, n2, 3, 0.35, 'overlay', size);
    hg.fillStyle = '#707070'; hg.fillRect(0, 0, size, size);
    overlayNoise(hg, n1, 6, 0.8, 'source-over', size);
    overlayNoise(hg, n3, 4, 0.4, 'overlay', size);
    rg.fillStyle = '#e6e6e6'; rg.fillRect(0, 0, size, size);
    // gravel speckles
    for (let k = 0; k < 9000; k++) {
      const x = rng.next() * size, y = rng.next() * size, r = 0.6 + rng.next() * 1.8, v = 60 + rng.next() * 70;
      g.fillStyle = `rgba(${v},${v * 0.95},${v * 0.88},0.7)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      hg.fillStyle = '#b8b8b8'; hg.beginPath(); hg.arc(x, y, r, 0, 7); hg.fill();
    }
    // deck plates inside the arena (2m grid) with worn / missing plates
    const A = arenaHalf + 0.4, plate = 2;
    for (let z = -A; z < A - 0.01; z += plate) for (let x = -A; x < A - 0.01; x += plate) {
      const r = rng.next();
      const cx = x + plate / 2, cz = z + plate / 2;
      const distEdge = A - Math.max(Math.abs(cx), Math.abs(cz));
      if (r < 0.1 + (distEdge < 2.5 ? 0.25 : 0)) continue; // missing plate -> soil shows through
      const v = 52 + rng.next() * 14;
      const X = W(x) + 1.5, Y = W(z) + 1.5, P = plate * px - 3;
      g.fillStyle = `rgb(${v},${v + 4},${v + 10})`; g.fillRect(X, Y, P, P);
      hg.fillStyle = '#9a9a9a'; hg.fillRect(X, Y, P, P);
      rg.fillStyle = `rgb(${120 + rng.next() * 60},0,0)`; rg.fillStyle = `#${Math.floor(110 + rng.next() * 60).toString(16).repeat(3)}`; rg.fillRect(X, Y, P, P);
      // tread pattern on some plates
      if (rng.next() < 0.35) {
        g.fillStyle = 'rgba(255,255,255,0.05)'; hg.fillStyle = '#b0b0b0';
        for (let ty = 6; ty < P - 4; ty += 10) for (let tx = 6 + ((ty / 10) % 2) * 5; tx < P - 4; tx += 10) {
          g.fillRect(X + tx, Y + ty, 6, 2); hg.fillRect(X + tx, Y + ty, 6, 2);
        }
      }
      // inner seam + bolts
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.strokeRect(X + 1, Y + 1, P - 2, P - 2);
      g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 1; g.strokeRect(X + 4, Y + 4, P - 8, P - 8);
      for (const [bx, by] of [[5, 5], [P - 5, 5], [5, P - 5], [P - 5, P - 5]]) { g.fillStyle = 'rgba(170,180,190,0.3)'; g.beginPath(); g.arc(X + bx, Y + by, 1.6, 0, 7); g.fill(); }
      hg.strokeStyle = '#5a5a5a'; hg.lineWidth = 2; hg.strokeRect(X, Y, P, P);
    }
    // grime / dirt over plates, stronger near walls
    g.save(); g.globalCompositeOperation = 'multiply';
    const p1 = g.createPattern(n2, 'repeat')!; p1.setTransform(new DOMMatrix().scale(4));
    g.globalAlpha = 0.55; g.fillStyle = p1; g.fillRect(0, 0, size, size);
    g.restore();
    for (let k = 0; k < 70; k++) {
      const x = W((rng.next() * 2 - 1) * (arenaHalf + 2)), y = W((rng.next() * 2 - 1) * (arenaHalf + 2)), r = (0.8 + rng.next() * 2.4) * px;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(48,40,32,0.75)'); gr.addColorStop(1, 'rgba(48,40,32,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // puddles (low roughness, darker)
    for (let k = 0; k < 14; k++) {
      const x = W((rng.next() * 2 - 1) * arenaHalf), y = W((rng.next() * 2 - 1) * arenaHalf), r = (0.6 + rng.next() * 1.6) * px;
      const gr = rg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(95,95,95,1)'); gr.addColorStop(0.7, 'rgba(95,95,95,0.8)'); gr.addColorStop(1, 'rgba(10,10,10,0)');
      rg.fillStyle = gr; rg.beginPath(); rg.ellipse(x, y, r, r * (0.5 + rng.next() * 0.5), rng.next() * 3, 0, 7); rg.fill();
      const ga = g.createRadialGradient(x, y, 0, x, y, r);
      ga.addColorStop(0, 'rgba(10,14,20,0.22)'); ga.addColorStop(1, 'rgba(10,14,20,0)');
      g.fillStyle = ga; g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, 7); g.fill();
    }
    // hazard stripes at the 4 gates
    const stripe = (x0: number, z0: number, w: number, d: number) => {
      g.save(); g.beginPath(); g.rect(W(x0), W(z0), w * px, d * px); g.clip();
      for (let s = -20; s < 40; s++) { g.fillStyle = s % 2 ? 'rgba(200,150,30,0.75)' : 'rgba(20,20,20,0.8)'; g.beginPath(); const o = W(x0) + s * 0.35 * px; g.moveTo(o, W(z0)); g.lineTo(o + 0.35 * px, W(z0)); g.lineTo(o + 0.35 * px + d * px, W(z0) + d * px); g.lineTo(o + d * px, W(z0) + d * px); g.fill(); }
      g.restore();
      overlayNoise(g, n1, 3, 0.25, 'multiply', size);
    };
    const H = arenaHalf;
    stripe(-2.2, -H + 0.2, 4.4, 0.6); stripe(-2.2, H - 0.8, 4.4, 0.6);
    stripe(-H + 0.2, -2.2, 0.6, 4.4); stripe(H - 0.8, -2.2, 0.6, 4.4);
    // painted floor markings (landing circle in the centre)
    g.strokeStyle = 'rgba(210,220,230,0.08)'; g.lineWidth = 0.14 * px;
    g.beginPath(); g.arc(W(0), W(0), 4.2 * px, 0, 7); g.stroke();
    g.setLineDash([0.6 * px, 0.4 * px]); g.beginPath(); g.arc(W(0), W(0), 5 * px, 0, 7); g.stroke(); g.setLineDash([]);
    // cracks
    for (let k = 0; k < 60; k++) {
      let x = rng.next() * size, y = rng.next() * size;
      g.strokeStyle = 'rgba(12,10,8,0.7)'; hg.strokeStyle = '#2a2a2a'; g.lineWidth = hg.lineWidth = 1.5;
      g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
      for (let s = 0; s < 10; s++) { x += (rng.next() - 0.5) * 30; y += (rng.next() - 0.5) * 30; g.lineTo(x, y); hg.lineTo(x, y); }
      g.stroke(); hg.stroke();
    }
  }, 2.5);
  for (const t of [set.map, set.normalMap, set.roughnessMap]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
  // emissive: faint glowing lines (deck light strips) — kept dark for now, used by later stages
  const E = canvas(256); E.g.fillStyle = '#000'; E.g.fillRect(0, 0, 256, 256);
  const emissiveMap = tex(E.c, true);
  return { ...set, emissiveMap };
}

/** Soft radial blob for contact shadows / decals. */
export function radialTexture(inner = 'rgba(0,0,0,0.85)', outer = 'rgba(0,0,0,0)'): THREE.Texture {
  const key = `radial:${inner}:${outer}`;
  if (cache.has(key)) return cache.get(key)!;
  const { c, g } = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
