// node tests/turntable.mjs <url> <out-prefix> [player|monster] [json-override]
import fs from 'node:fs';
import { launch, waitGame } from './browser.mjs';
const [url, prefix, kind = 'player', ov, opts] = process.argv.slice(2);
const { browser, page } = await launch();
await page.goto(url); await waitGame(page);
const data = await page.evaluate(([k, o, op]) => __game.debug.turntable(k, o ? JSON.parse(o) : undefined, op ? JSON.parse(op) : {}), [kind, ov, opts]);
fs.writeFileSync(`${prefix}_${kind}.png`, Buffer.from(data.split(',')[1], 'base64'));
console.log('errors', await page.evaluate(() => __game.errors()));
await browser.close();
