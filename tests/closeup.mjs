// Close-up turntable cells for asset iteration. node tests/closeup.mjs --kind player|monster --variant vanguard --only 1,4 --out file.png
import fs from 'node:fs';
import { launch, waitGame } from './browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const { browser, page } = await launch();
await page.goto(arg('url', 'http://localhost:5199/') + '?paused=1&player=vanguard&monster=reaver'); await waitGame(page);
const url = await page.evaluate(([k, v, only, half, center]) => __game.debug.turntable(k, undefined, { variant: v, cell: 640, only: only.split(',').map(Number), closeHalf: half, center }),
  [arg('kind', 'player'), arg('variant', 'vanguard'), arg('only', '1,5'), Number(arg('half', 1.05)), Number(arg('center', 1.0))]);
fs.writeFileSync(arg('out', 'closeup.png'), Buffer.from(url.split(',')[1], 'base64'));
console.log('errors', await page.evaluate(() => __game.errors()));
await browser.close();
