// Dev helper: node tests/hdshot.mjs <url-query> <outPrefix> [turntable kind] [zoom]
import fs from 'node:fs';
import { launch, waitGame } from './browser.mjs';
const [q = '', out = 'shot', tt = '', zoomArg = '', pre = ''] = process.argv.slice(2);
const { browser, page, consoleErrors } = await launch();
await page.goto('http://localhost:8080/' + q); await waitGame(page);
await page.waitForFunction(() => { const i = __game.settings.info(); const s = i.settings; return (s.player !== 'hd' || i.hd.player) && (s.monster !== 'hd' || i.hd.monster) && (s.env !== 'hd' || i.hd.envkit); }, null, { timeout: 60000 });
await page.evaluate(() => { __game.pause(true); __game.render(); });
if (pre) await page.evaluate(pre);
if (zoomArg) await page.evaluate((z) => __game.debug.zoom(Number(z)), zoomArg);
await page.waitForTimeout(300);
await page.screenshot({ path: out + '_game.png' });
if (tt) {
  const url = await page.evaluate((k) => __game.debug.turntable(k, undefined, { cell: 260 }), tt);
  fs.writeFileSync(out + '_tt.png', Buffer.from(url.split(',')[1], 'base64'));
}
console.log(JSON.stringify(await page.evaluate(() => __game.settings.info())), 'errors', await page.evaluate(() => __game.errors()), consoleErrors);
await browser.close();
