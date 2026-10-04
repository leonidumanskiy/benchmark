import { Sim, DT, GameEvent } from './sim/sim';
import { CFG } from './sim/config';
import { GameView } from './render/view';
import { InputController } from './input';
import { Hud } from './ui/hud';
import { installApi } from './api';
import { SoundSystem } from './audio/sound';
import { Settings, loadSettings, saveSettings, sanitize } from './settings';
import { loadAsset, GenAssetId } from './assets/gen/library';
import { PauseMenu } from './ui/menu';

// ---- error capture first, so boot failures are visible to tooling
export const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => errors.push(`rejection: ${String(e.reason)}`));
const origErr = console.error.bind(console);
console.error = (...a: unknown[]) => { errors.push('console: ' + a.map(String).join(' ')); origErr(...a); };

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;
const sim = new Sim();
sim.reset({ seed: Number(params.get('seed') ?? 1), waves: params.get('waves') !== '0' });
const view = new GameView(sim, canvas);
view.debug = params.get('debug') === '1';
const input = new InputController(canvas);
const hud = new Hud();
const sound = new SoundSystem(sim);
if (params.get('mute') === '1') sound.setMuted(true);

// ---- presentation settings (pause menu / URL / localStorage). Assets for selected variants load before first frame.
export let settings: Settings = loadSettings(params);
let menuRef: PauseMenu | null = null;
const needed = (s: Settings) => [s.player === 'vanguard' && 'vanguard', s.monster === 'reaver' && 'reaver', s.env === 'kit2' && 'envkit'].filter(Boolean) as GenAssetId[];
export async function applySettings(patch: Partial<Settings>) {
  const next = sanitize({ ...settings, ...patch });
  await Promise.all(needed(next).map(loadAsset));
  settings = next;
  // compare against what the view actually shows, so a failed earlier apply is retried
  if (view.playerVariant !== next.player) view.setPlayerVariant(next.player);
  if (view.monsterVariant !== next.monster) view.setMonsterVariant(next.monster);
  if (view.envVariant !== next.env) view.setEnvVariant(next.env);
  if (view.cameraMode !== next.camera || view.perspCam.fov !== next.fov) view.setCameraMode(next.camera, next.fov);
  saveSettings(next);
  menuRef?.refresh();
  renderFrame(0);
  return next;
}
try { await Promise.all(needed(settings).map(loadAsset)); } catch (e) { errors.push('asset preload: ' + String(e)); settings = sanitize({ camera: settings.camera, fov: settings.fov }); }

export const loop = { paused: params.get('paused') === '1', acc: 0, last: performance.now(), frames: 0, fps: 0, fpsT: 0, timeScale: 1 };
const pending: GameEvent[] = [];

export function stepSim(n: number) {
  for (let i = 0; i < n; i++) { input.apply(sim, view); sim.step(1); }
  pending.push(...sim.drainEvents());
}

export function renderFrame(dt: number) {
  const ev = pending.splice(0);
  view.update(dt, ev);
  hud.update(sim, ev, view);
  sound.update(dt, ev);
  view.render();
}

input.onAction = (a) => {
  if (a === 'reset') { sim.reset({ seed: sim.seed, waves: sim.phase !== 'sandbox' }); view.onReset(); view.updateCamera(true); hud.reset(); sound.reset(); }
  if (a === 'debug') { view.debug = !view.debug; }
  if (a === 'pause') menu.toggle();
  if (a === 'mute') sound.toggleMute();
};

const menu = menuRef = new PauseMenu(() => settings, async (p) => { await applySettings(p); }, (open) => { loop.paused = open; input.keys.clear(); input.fireHeld = false; });

window.addEventListener('resize', () => view.resize());
view.updateCamera(true);
await applySettings({}).catch((e) => errors.push('settings: ' + String(e)));

function frame() {
  // performance.now() rather than the rAF timestamp: the latter can lag/stall in some (headless) compositors
  const now = performance.now();
  const dt = Math.max(0, Math.min(0.1, (now - loop.last) / 1000));
  loop.last = now;
  loop.frames++; loop.fpsT += dt;
  if (loop.fpsT >= 0.5) { loop.fps = Math.round(loop.frames / loop.fpsT); loop.frames = 0; loop.fpsT = 0; }
  try {
    if (!loop.paused) {
      loop.acc += dt * loop.timeScale;
      let n = 0;
      while (loop.acc >= DT && n < 8) { stepSim(1); loop.acc -= DT; n++; }
      if (n === 8) loop.acc = 0;
    }
    renderFrame(loop.paused ? 0 : dt); // paused => visuals freeze too (effects, animation)
  } catch (e) {
    errors.push('frame: ' + (e as Error).stack);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

installApi({ sim, view, input, loop, errors, stepSim, renderFrame, hud, sound, CFG, settings: { get: () => settings, apply: applySettings, menu } });
