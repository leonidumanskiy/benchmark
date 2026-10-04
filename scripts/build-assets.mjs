// Autonomous HD asset pipeline: spec JSON + Blender scripts -> public/assets/hd/*.glb (+ per-asset report JSON).
// Usage: node scripts/build-assets.mjs [player|monster|envkit|floor ...] [--force] [--fast]
//   --fast : 1024 atlas / 6 samples (iteration); default uses the spec's atlas/samples (release quality)
// Blender: $BLENDER, else .tools/blender/blender, else `blender` on PATH (scripts/get-blender.sh installs 4.2 LTS locally).
// Rebuilds only assets whose inputs (spec + build script + lib.py) changed; hashes are kept in public/assets/hd/manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(root, 'public/assets/hd');
const SRC = path.join(root, 'assets-src');
const ASSETS = {
  player: { script: 'build_player.py', spec: 'player.json' },
  monster: { script: 'build_monster.py', spec: 'monster.json' },
  envkit: { script: 'build_envkit.py', spec: 'envkit.json' },
  floor: { script: 'build_floor.py', spec: 'envkit.json' },
};
const argv = process.argv.slice(2);
const force = argv.includes('--force'), fast = argv.includes('--fast');
const want = argv.filter((a) => !a.startsWith('--'));
const list = want.length ? want : Object.keys(ASSETS);

function findBlender() {
  const cands = [process.env.BLENDER, path.join(root, '.tools/blender/blender'), '/opt/blender/blender-4.2.3-linux-x64/blender', 'blender'].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ['-b', '--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Blender \d/.test(r.stdout)) return { exe: c, version: r.stdout.split('\n')[0].trim() };
  }
  console.error('Blender not found. Set $BLENDER or run: sh scripts/get-blender.sh');
  process.exit(2);
}

const sha = (...files) => { const h = crypto.createHash('sha256'); for (const f of files) h.update(fs.readFileSync(f)); return h.digest('hex').slice(0, 16); };
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { assets: {} };
fs.mkdirSync(OUT, { recursive: true });
let blender = null;
for (const name of list) {
  const a = ASSETS[name];
  if (!a) { console.error('unknown asset ' + name); process.exit(2); }
  const specFile = path.join(SRC, 'specs', a.spec), script = path.join(SRC, 'blender', a.script);
  const hash = sha(specFile, script, path.join(SRC, 'blender/lib.py')) + (fast ? '-fast' : '');
  const glb = path.join(OUT, `${name}.glb`);
  if (!force && manifest.assets[name]?.hash === hash && fs.existsSync(glb)) { console.log(`= ${name}: up to date (${hash})`); continue; }
  blender ??= findBlender();
  let spec = specFile;
  if (fast) {
    const s = JSON.parse(fs.readFileSync(specFile, 'utf8')); s.atlas = 1024; s.samples = 6; if (s.floor) s.floor.size = 1024;
    spec = path.join(os.tmpdir(), `spec-${name}-fast.json`); fs.writeFileSync(spec, JSON.stringify(s));
  }
  console.log(`> ${name}: building with ${blender.version} ...`);
  const t0 = Date.now();
  const r = spawnSync(blender.exe, ['-b', '--factory-startup', '-P', script, '--', spec, glb], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const info = (r.stdout.match(/ASSET_INFO (.*)/) || [])[1];
  if (r.status !== 0 || !info) { console.error(r.stdout.slice(-4000), r.stderr.slice(-4000)); console.error(`! ${name} failed`); process.exit(1); }
  const report = JSON.parse(fs.readFileSync(glb.replace('.glb', '.json'), 'utf8'));
  manifest.assets[name] = { hash, glb: `${name}.glb`, bytes: fs.statSync(glb).size, seconds: Math.round((Date.now() - t0) / 1000), blender: blender.version, fast, ...report };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  console.log(`  ${name}: ${JSON.stringify(manifest.assets[name])}`);
}
