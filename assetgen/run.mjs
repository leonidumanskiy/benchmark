// Asset pipeline orchestrator: spec JSON + Blender generator script -> GLB (+ manifest). Fully headless.
//   node assetgen/run.mjs                 # rebuild assets whose spec/script/library/Blender version changed
//   node assetgen/run.mjs --force         # rebuild all
//   node assetgen/run.mjs --only vanguard --override '{"equipment":{"backpack":"reactor"}}' --out tmp/vanguard_reactor.glb
// Blender: $BLENDER, else a pinned portable build in ~/.cache/b02-tools (downloaded from download.blender.org on first use).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BLENDER_VERSION = '4.5.14';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT_DIR = path.join(root, 'public/assets/gen');
export const ASSETS = [
  { id: 'vanguard', script: 'gen_vanguard.py', spec: 'specs/vanguard.json' },
  { id: 'reaver', script: 'gen_reaver.py', spec: 'specs/reaver.json' },
  { id: 'envkit', script: 'gen_envkit.py', spec: 'specs/envkit.json' },
];

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] ?? true : d; };

function blenderUrl() {
  const [maj, min] = BLENDER_VERSION.split('.');
  const plat = process.platform === 'win32' ? 'windows-x64.zip' : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'macos-arm64.dmg' : 'macos-x64.dmg') : 'linux-x64.tar.xz';
  return `https://download.blender.org/release/Blender${maj}.${min}/blender-${BLENDER_VERSION}-${plat}`;
}

export function findBlender({ download = true } = {}) {
  if (process.env.BLENDER && fs.existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const cache = path.join(os.homedir(), '.cache', 'b02-tools');
  const exe = process.platform === 'win32' ? 'blender.exe' : 'blender';
  const dir = path.join(cache, `blender-${BLENDER_VERSION}-${process.platform === 'win32' ? 'windows-x64' : 'linux-x64'}`);
  const bin = path.join(dir, exe);
  if (fs.existsSync(bin)) return bin;
  if (!download) return null;
  if (process.platform === 'darwin') throw new Error('macOS: install Blender ' + BLENDER_VERSION + ' and set BLENDER=/path/to/blender');
  fs.mkdirSync(cache, { recursive: true });
  const url = blenderUrl();
  const archive = path.join(cache, path.basename(url));
  console.log(`downloading ${url}`);
  execFileSync('curl', ['-L', '--fail', '-o', archive, url], { stdio: 'inherit' });
  const tar = process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar';
  execFileSync(tar, ['-xf', archive, '-C', cache], { stdio: 'inherit' });
  fs.rmSync(archive);
  if (!fs.existsSync(bin)) throw new Error('Blender binary not found after unpack: ' + bin);
  return bin;
}

const sha = (...files) => { const h = crypto.createHash('sha256'); for (const f of files) h.update(fs.readFileSync(f)); return h.digest('hex').slice(0, 16); };

function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b ?? a;
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a?.[k] ?? {}, v) : v;
  return o;
}

export function generate(asset, { blender, out, override, log = true } = {}) {
  let specPath = path.join(here, asset.spec);
  if (override) {
    const merged = deepMerge(JSON.parse(fs.readFileSync(specPath, 'utf8')), typeof override === 'string' ? JSON.parse(override) : override);
    specPath = path.join(os.tmpdir(), `b02-spec-${asset.id}-${process.pid}.json`);
    fs.writeFileSync(specPath, JSON.stringify(merged, null, 1));
  }
  const outFile = out ?? path.join(OUT_DIR, `${asset.id}.glb`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const t0 = Date.now();
  const stdout = execFileSync(blender, ['-b', '--factory-startup', '-noaudio', '-P', path.join(here, asset.script), '--', '--spec', specPath, '--out', outFile], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const m = stdout.match(/ tris (\d+)/);
  if (!fs.existsSync(outFile) || !/WROTE/.test(stdout)) throw new Error(`${asset.id}: generator failed\n${stdout.slice(-3000)}`);
  const res = { id: asset.id, file: path.relative(root, outFile).replaceAll('\\', '/'), tris: m ? Number(m[1]) : null, bytes: fs.statSync(outFile).size, seconds: +((Date.now() - t0) / 1000).toFixed(1) };
  if (log) console.log(`  ${asset.id}: ${res.tris} tris, ${(res.bytes / 1e6).toFixed(2)} MB, ${res.seconds}s -> ${res.file}`);
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const blender = findBlender();
  const only = arg('only') ? String(arg('only')).split(',') : null;
  const force = !!arg('force', false);
  const override = arg('override');
  const out = arg('out');
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { assets: {} };
  console.log(`Blender ${BLENDER_VERSION}: ${blender}`);
  for (const a of ASSETS) {
    if (only && !only.includes(a.id)) continue;
    const key = sha(path.join(here, a.spec), path.join(here, a.script), path.join(here, 'blib.py')) + '-' + BLENDER_VERSION;
    if (override || out) { generate(a, { blender, out: out ? path.resolve(out) : undefined, override }); continue; } // ad-hoc variant: manifest untouched
    if (!force && manifest.assets[a.id]?.key === key && fs.existsSync(path.join(OUT_DIR, `${a.id}.glb`))) { console.log(`  ${a.id}: up to date (${key})`); continue; }
    const r = generate(a, { blender });
    manifest.assets[a.id] = { key, ...r, spec: a.spec, script: a.script };
  }
  if (!override && !out) {
    manifest.blender = BLENDER_VERSION;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  }
}
