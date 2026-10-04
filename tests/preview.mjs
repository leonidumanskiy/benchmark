// Dev preview for asset iteration: turntables + in-game frames for the selected variants.
// Usage: node tests/preview.mjs --url http://localhost:5199/ --out <dir> [--what player,monster,scene,persp]
import fs from 'node:fs';
import path from 'node:path';
import { launch, waitGame } from './browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://localhost:5199/'), out = arg('out', 'evidence/tmp/preview'), what = arg('what', 'player,monster,scene').split(',');
fs.mkdirSync(out, { recursive: true });
const { browser, page, consoleErrors } = await launch({ width: Number(arg('w', 1280)), height: Number(arg('h', 720)) });
await page.goto(url + '?all=new&paused=1'); await waitGame(page);
const save = (name, dataUrl) => fs.writeFileSync(path.join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
if (what.includes('player')) save('tt_vanguard.png', await page.evaluate(() => __game.debug.turntable('player', undefined, { variant: 'vanguard', cell: 300 })));
if (what.includes('monster')) save('tt_reaver.png', await page.evaluate(() => __game.debug.turntable('monster', undefined, { variant: 'reaver', cell: 300, closeHalf: 1.9, center: 0.9 })));
const shot = async (name, cam) => {
  await page.evaluate(async (cam) => { await __game.settings.set({ camera: cam }); __game.pause(true); __game.reset({ waves: false, player: { x: 0, z: 2 } });
    for (const [x, z] of [[3, -2], [5, -4], [-1.5, 3.5]]) __game.debug.spawn(x, z, { dummy: true }); __game.aimAt(4, -3); __game.step(30); }, cam);
  await page.screenshot({ path: path.join(out, name) });
};
if (what.includes('scene')) await shot('scene_ortho.png', 'ortho');
if (what.includes('persp')) await shot('scene_persp.png', 'persp');
const info = await page.evaluate(() => ({ errors: __game.errors(), assets: __game.assets(), cam: __game.camera(), scene: __game.scene() }));
console.log(JSON.stringify({ ...info, consoleErrors }, null, 1).slice(0, 3000));
await browser.close();
