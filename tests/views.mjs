// node tests/views.mjs <url> <outprefix> : screenshots at several arena locations with a few visible monsters
import { launch, waitGame } from './browser.mjs';
const [url, prefix] = process.argv.slice(2);
const { browser, page } = await launch();
await page.goto(url); await waitGame(page);
const spots = [
  { name: 'center', p: { x: 0, z: 2 }, aim: { x: 4, z: -3 }, mons: [[3, -2], [5, -4], [-1.5, 3.5]] },
  { name: 'nw', p: { x: -10, z: -6 }, aim: { x: -12, z: -12 }, mons: [[-9, -8.5]] },
  { name: 'gate_e', p: { x: 13, z: 0 }, aim: { x: 20, z: 0 }, mons: [[15.5, 0.5], [17, -1]] },
];
for (const s of spots) {
  await page.evaluate((s) => {
    __game.pause(true); __game.reset({ waves: false, player: s.p });
    for (const [x, z] of s.mons) __game.debug.spawn(x, z, { dummy: true });
    __game.aimAt(s.aim.x, s.aim.z); __game.step(2);
  }, s);
  await page.screenshot({ path: `${prefix}_${s.name}.png` });
}
console.log('errors', await page.evaluate(() => __game.errors()));
await browser.close();
