// Quick screenshot: node tests/shot.mjs <url> <out.png> [js-to-eval-before]
import { launch, waitGame } from './browser.mjs';
const [url, out, pre] = process.argv.slice(2);
const { browser, page, consoleErrors } = await launch();
await page.goto(url); await waitGame(page);
if (pre) await page.evaluate(pre);
await page.waitForTimeout(500);
await page.screenshot({ path: out });
console.log(JSON.stringify(await page.evaluate(() => { const s = __game.state(); return { stage: s.stage, fps: s.fps, phase: s.phase, monsters: s.monsters.length, errors: __game.errors(), gl: (() => { const gl = __game.view.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; })() }; })));
console.log('console errors:', consoleErrors);
await browser.close();
