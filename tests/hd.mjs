// Stage-07 checks only (HD assets + weak perspective + pause menu), against a built web root.
// Usage: node tests/hd.mjs [--dir dist] [--out evidence/tmp] [--port 8091]
import fs from 'node:fs';
import path from 'node:path';
import { launch, startServer, waitGame } from './browser.mjs';
import { makeLog } from './core-checks.mjs';
import { run } from './stage07.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('dir', 'dist'), out = arg('out', 'evidence/tmp'), port = Number(arg('port', 8091));
fs.mkdirSync(out, { recursive: true });
const server = await startServer(dir, port);
const log = makeLog();
const { browser, page } = await launch();
try {
  await page.goto(`http://localhost:${port}/`); await waitGame(page);
  await run(page, log, out, { skipPrevious: true });
} catch (e) { log.check('runner exception', false, { error: String(e.stack || e) }); }
await browser.close(); server.kill();
const passed = log.results.filter((r) => r.ok).length;
fs.writeFileSync(path.join(out, 'checks_hd.json'), JSON.stringify({ passed, failed: log.results.length - passed, results: log.results }, null, 1));
console.log(`\n${passed}/${log.results.length} HD checks passed`);
process.exit(passed === log.results.length ? 0 : 1);
