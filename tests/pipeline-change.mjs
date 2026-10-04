// Pipeline modifiability check: change the shared spec (vanguard backpack comms -> reactor), regenerate the GLB headlessly
// with Blender, and compare 8-angle turntables of both builds in the running game. Needs Blender (assetgen/run.mjs).
// node tests/pipeline-change.mjs --url http://localhost:5199/ --out evidence/07-assets
import fs from 'node:fs'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, waitGame } from './browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'evidence/tmp'); fs.mkdirSync(out, { recursive: true });
const t0 = Date.now();
execFileSync(process.execPath, ['assetgen/run.mjs', '--only', 'vanguard', '--override', '{"equipment":{"backpack":"reactor","helmetCrest":false}}', '--out', 'public/assets/gen/variants/vanguard_reactor.glb'], { stdio: 'inherit' });
const genSeconds = (Date.now() - t0) / 1000;
const { browser, page } = await launch();
const sheet = async (q) => {
  await page.goto(arg('url', 'http://localhost:5199/') + '?paused=1&player=vanguard' + q); await waitGame(page);
  return page.evaluate(async () => {
    const url = __game.debug.turntable('player', undefined, { variant: 'vanguard', closeHalf: 1.15, center: 0.95 });
    const a = __game.debug.turntable('player', undefined, { variant: 'vanguard', analysis: true, cell: 220, closeHalf: 1.15 });
    const img = new Image(); img.src = a; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { url, cells: [...Array(8).keys()].map((i) => Array.from(g.getImageData(i * 220, 0, 220, 220).data)) };
  });
};
const A = await sheet(''), B = await sheet('&gen.vanguard=./assets/gen/variants/vanguard_reactor.glb');
fs.writeFileSync(path.join(out, 'turntable_vanguard_reactor_variant.png'), Buffer.from(B.url.split(',')[1], 'base64'));
const diffs = A.cells.map((a, i) => { let n = 0; for (let k = 0; k < a.length; k += 4) if (Math.abs(a[k] - B.cells[i][k]) + Math.abs(a[k + 1] - B.cells[i][k + 1]) + Math.abs(a[k + 2] - B.cells[i][k + 2]) > 60) n++; return n; });
const res = { change: 'equipment.backpack comms->reactor, helmetCrest off (spec override -> Blender regen)', generatorSeconds: genSeconds, changedPixelsPerAngle: diffs, visibleFromAngles: diffs.filter((d) => d > 150).length, manualEdits: 0 };
console.log(JSON.stringify(res));
fs.writeFileSync(path.join(out, 'pipeline_change.json'), JSON.stringify(res, null, 1));
await browser.close();
