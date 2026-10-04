// FPS probe for a settings combo. node tests/perf.mjs --q "all=new&cam=persp"
import { launch, waitGame } from './browser.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const { browser, page } = await launch({ headless: arg('headless', '1') === '1' });
await page.goto(arg('url', 'http://localhost:5199/') + '?' + arg('q', 'all=new')); await waitGame(page);
const r = await page.evaluate(async () => { __game.reset({ seed: 3, waves: true }); await new Promise((r) => setTimeout(r, 6000)); return { fps: __game.loop.fps, scene: __game.scene().tris, calls: __game.scene().drawCalls, mons: __game.sim.monsters.length }; });
console.log(JSON.stringify(r));
await browser.close();
