// Package an immutable stage build and verify the UNPACKED archive in a separate folder.
// Usage: node scripts/package-stage.mjs --stage 1 --name 01-tech [--verify-only]
//  1. stage dir: web/ (built dist), serve.mjs, run.bat, run.sh, RUN.md, source.zip, STAGE.md, evidence/
//  2. zip -> builds/<name>.zip (refuses to overwrite a finalised archive)
//  3. unpack into a temp folder, run the full stage e2e against it, rebuild from source.zip (npm ci + build + unit tests)
//  4. append verification results to STAGE.md and write the final archive
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, execSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const stage = Number(arg('stage')); const name = arg('name');
const root = process.cwd();
const TAR = 'C:/Windows/System32/tar.exe'; // bsdtar: writes real .zip with -a
const buildsDir = path.join(root, 'builds');
const finalZip = path.join(buildsDir, `${name}.zip`);
if (fs.existsSync(finalZip)) { console.error(`${finalZip} already exists (archives are immutable; use a -rN name)`); process.exit(2); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), `pkg-${name}-`));
const stageDir = path.join(work, name);
fs.mkdirSync(stageDir, { recursive: true });
const sh = (cmd, cwd = root) => { console.log(`$ ${cmd}`); return execSync(cmd, { cwd, stdio: 'inherit', shell: true }); };
const zipDir = (dir, out, entries) => execFileSync(TAR, ['-a', '-c', '-f', out, '-C', dir, ...entries], { stdio: 'inherit' });
const unzip = (zip, dir) => { fs.mkdirSync(dir, { recursive: true }); execFileSync(TAR, ['-x', '-f', zip, '-C', dir], { stdio: 'inherit' }); };

// ---- 1. assemble
sh('npm run build');
fs.cpSync(path.join(root, 'dist'), path.join(stageDir, 'web'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts/serve.mjs'), path.join(stageDir, 'serve.mjs'));
fs.writeFileSync(path.join(stageDir, 'run.bat'), '@echo off\r\ncd /d "%~dp0"\r\nstart "" http://localhost:8080/\r\nnode serve.mjs web 8080\r\n');
fs.writeFileSync(path.join(stageDir, 'run.sh'), '#!/bin/sh\ncd "$(dirname "$0")"\nnode serve.mjs web 8080\n');
const runMd = fs.readFileSync(path.join(root, 'stages/RUN.template.md'), 'utf8').replaceAll('{{NAME}}', name).replaceAll('{{STAGE}}', String(stage));
fs.writeFileSync(path.join(stageDir, 'RUN.md'), runMd);
const srcEntries = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', '.gitignore', 'src', 'scripts', 'tests', 'stages', 'assetgen', 'public'].filter((e) => fs.existsSync(path.join(root, e)));
zipDir(root, path.join(stageDir, 'source.zip'), srcEntries);
const evSrc = path.join(root, 'evidence', name);
if (!fs.existsSync(evSrc)) { console.error('missing evidence dir ' + evSrc); process.exit(3); }
fs.cpSync(evSrc, path.join(stageDir, 'evidence'), { recursive: true });
const stageMdSrc = path.join(root, 'stages', name, 'STAGE.md');
fs.copyFileSync(stageMdSrc, path.join(stageDir, 'STAGE.md'));

// ---- 2. candidate archive
const candidate = path.join(work, `${name}.candidate.zip`);
zipDir(work, candidate, [name]);

// ---- 3. verify unpacked candidate in a separate folder
const vdir = fs.mkdtempSync(path.join(os.tmpdir(), `verify-${name}-`));
unzip(candidate, vdir);
const unpacked = path.join(vdir, name);
const verify = { unpackedAt: unpacked, e2e: null, rebuild: null };
try {
  sh(`node "${path.join(root, 'tests/e2e.mjs')}" --dir "${unpacked}" --out "${path.join(vdir, 'verify-evidence')}" --stage ${stage} --port 8097`);
  verify.e2e = 'PASS';
} catch { verify.e2e = 'FAIL'; }
const checks = JSON.parse(fs.readFileSync(path.join(vdir, 'verify-evidence', 'checks.json'), 'utf8'));
// rebuild from source.zip in its own folder
const rdir = path.join(vdir, 'rebuild');
unzip(path.join(unpacked, 'source.zip'), rdir);
try {
  sh('npm ci --no-audit --no-fund', rdir);
  sh('npm run build', rdir);
  sh('npm test', rdir);
  const a = fs.readdirSync(path.join(rdir, 'dist/assets')).sort().join(',');
  const b = fs.readdirSync(path.join(unpacked, 'web/assets')).sort().join(',');
  verify.rebuild = a === b ? 'PASS (identical hashed asset names)' : `PASS (built; asset names differ: ${a} vs ${b})`;
} catch (e) { verify.rebuild = 'FAIL ' + e.message; }

// ---- 4. finalise
const vtext = `\n\n## Проверка распакованного архива (автоматически, scripts/package-stage.mjs)\n\n` +
  `- Архив распакован в отдельную папку \`${unpacked.replaceAll('\\', '/')}\`, запущен его собственный \`serve.mjs\`, прогнан полный набор e2e этапа: **${verify.e2e}** (${checks.passed}/${checks.passed + checks.failed} проверок).\n` +
  `- \`source.zip\` распакован отдельно → \`npm ci\` → \`npm run build\` → \`npm test\`: **${verify.rebuild}**.\n` +
  (checks.failed ? `- Непройденные проверки: ${checks.results.filter((r) => !r.ok).map((r) => r.name).join('; ')}\n` : '');
fs.appendFileSync(path.join(stageDir, 'STAGE.md'), vtext);
fs.copyFileSync(path.join(vdir, 'verify-evidence', 'checks.json'), path.join(stageDir, 'evidence', 'checks_unpacked_archive.json'));
fs.mkdirSync(buildsDir, { recursive: true });
zipDir(work, finalZip, [name]);
fs.writeFileSync(path.join(buildsDir, `${name}.verify.json`), JSON.stringify({ ...verify, passed: checks.passed, failed: checks.failed }, null, 1));
console.log(`\nWROTE ${finalZip}\nverify: ${JSON.stringify(verify)}`);
process.exit(verify.e2e === 'PASS' && verify.rebuild.startsWith('PASS') ? 0 : 1);
