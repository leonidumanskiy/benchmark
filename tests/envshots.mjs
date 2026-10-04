// Close environment frames for kit iteration. node tests/envshots.mjs --out dir [--env kit2] [--zoom 4]
import fs from 'node:fs'; import path from 'node:path';
import { launch, waitGame } from './browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = arg('out', 'evidence/tmp/env'); fs.mkdirSync(out, { recursive: true });
const { browser, page } = await launch();
await page.goto(arg('url', 'http://localhost:5199/') + `?paused=1&player=vanguard&monster=reaver&env=${arg('env', 'kit2')}&cam=${arg('cam', 'ortho')}`); await waitGame(page);
const spots = JSON.parse(arg('spots', '[["wall",-11.5,-9],["cover",-6,-5],["rock",-11,1.5],["lair",0,-18],["corner",-17,-17]]'));
for (const [name, x, z] of spots) {
  await page.evaluate(([x, z, zm]) => { __game.reset({ waves: false, player: { x: 0, z: 2 } }); __game.debug.zoom(zm); __game.debug.focus(x, z); __game.step(2); }, [x, z, Number(arg('zoom', 4))]);
  await page.screenshot({ path: path.join(out, `env_${name}.png`) });
}
console.log(await page.evaluate(() => JSON.stringify({ e: __game.errors(), s: __game.scene().drawCalls, t: __game.scene().tris, l: __game.scene().lamps })));
await browser.close();
