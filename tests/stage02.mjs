// Stage 02 checks: 8-angle turntables, silhouette stability across angles, spec change visible from all sides, scene frames.
import fs from 'node:fs';
import path from 'node:path';

async function sheetMetrics(page, kind, override) {
  return page.evaluate(async ([kind, override]) => {
    const url = __game.debug.turntable(kind, override, { analysis: true, cell: 220 });
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const cell = 220, out = [];
    for (let i = 0; i < 8; i++) {
      const d = g.getImageData(i * cell, 0, cell, cell).data;
      let minY = cell, maxY = -1, minX = cell, maxX = -1, n = 0;
      const mask = new Uint8Array(cell * cell);
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
        const k = (y * cell + x) * 4;
        const bg = d[k] > 200 && d[k + 1] < 60 && d[k + 2] > 200;
        if (!bg) { n++; mask[y * cell + x] = 1; if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x; }
      }
      out.push({ h: maxY - minY + 1, w: maxX - minX + 1, px: n, data: Array.from(d) });
    }
    return out;
  }, [kind, override]);
}

export async function run(page, { check }, out) {
  await page.evaluate(() => { __game.pause(true); __game.reset({ waves: false }); });
  // ---- turntables (visual evidence)
  for (const kind of ['player', 'monster']) {
    const url = await page.evaluate((k) => __game.debug.turntable(k), kind);
    fs.writeFileSync(path.join(out, `turntable_${kind}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  // ---- silhouette stability across 8 angles (proportions preserved): top-down iso => height varies little
  for (const kind of ['player', 'monster']) {
    const m = await sheetMetrics(page, kind);
    const hs = m.map((c) => c.h), px = m.map((c) => c.px);
    const hVar = (Math.max(...hs) - Math.min(...hs)) / Math.max(...hs);
    check(`${kind}: visible in all 8 angles, silhouette height stable`, px.every((p) => p > 2000) && hVar < 0.3, { heights: hs, pixels: px, heightVariation: +hVar.toFixed(3) });
  }
  // ---- equipment change through the shared spec: compare 'pack' vs current spec ('reactor')
  const beforeUrl = await page.evaluate(() => __game.debug.turntable('player', { equipment: { backpack: 'pack' } }));
  fs.writeFileSync(path.join(out, 'turntable_player_before_change.png'), Buffer.from(beforeUrl.split(',')[1], 'base64'));
  const before = await sheetMetrics(page, 'player', { equipment: { backpack: 'pack' } });
  const after = await sheetMetrics(page, 'player');
  const diffs = before.map((b, i) => { let n = 0; for (let k = 0; k < b.data.length; k += 4) if (Math.abs(b.data[k] - after[i].data[k]) + Math.abs(b.data[k + 1] - after[i].data[k + 1]) + Math.abs(b.data[k + 2] - after[i].data[k + 2]) > 60) n++; return n; });
  const spec = await page.evaluate(() => __game.debug.specs().player.equipment);
  check('spec change (backpack pack→reactor) visible consistently from every angle except where the body occludes it', diffs.filter((d) => d > 150).length >= 7 && spec.backpack === 'reactor', { changedPixelsPerAngle: diffs, spec });
  // ---- scene frames at game scale
  const spots = [
    { name: 'scene_center', p: { x: 0, z: 2 }, aim: { x: 4, z: -3 }, mons: [[3, -2], [5, -4], [-1.5, 3.5]] },
    { name: 'scene_gate', p: { x: 13, z: 0 }, aim: { x: 20, z: 0 }, mons: [[15.5, 0.5], [17, -1]] },
  ];
  for (const s of spots) {
    await page.evaluate((s) => { __game.reset({ waves: false, player: s.p }); for (const [x, z] of s.mons) __game.debug.spawn(x, z, { dummy: true }); __game.aimAt(s.aim.x, s.aim.z); __game.step(2); }, s);
    await page.screenshot({ path: path.join(out, `${s.name}.png`) });
  }
  const info = await page.evaluate(() => ({ scene: __game.scene(), state: __game.state() }));
  check('scene assets built (obstacles/decor/backdrop) without errors', info.scene.meshes > 100 && (await page.evaluate(() => __game.errors())).length === 0, { meshes: info.scene.meshes, tris: info.scene.tris, drawCalls: info.scene.drawCalls });
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(info, null, 1));
}
