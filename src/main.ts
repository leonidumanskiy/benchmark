import { Sim, DT, GameEvent } from './sim/sim';
import { CFG } from './sim/config';
import { GameView } from './render/view';
import { InputController } from './input';
import { Hud } from './ui/hud';
import { installApi } from './api';
import { SoundSystem } from './audio/sound';
import { loadSettings, saveSettings } from './settings';
import { PauseMenu } from './ui/menu';
import { hdReady } from './assets/hd/hd';

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
const settings = loadSettings(params);
const menu = new PauseMenu(settings);
const settingsStatus = () => {
  const s = view.settings;
  const parts = (['player', 'monster', 'envkit'] as const).map((k) => { const a = hdReady(k); return a ? `${k} ${(a.tris / 1000).toFixed(1)}k tris` : null; }).filter(Boolean);
  menu.setStatus(view.hdError ? 'HD load failed: ' + view.hdError : (s.camera === 'persp' ? `weak perspective · ${s.focal} mm` : 'orthographic isometric') + (parts.length ? '\nHD loaded: ' + parts.join(' · ') : ''));
};
export function applySettings(s: typeof settings) {
  saveSettings(s); menu.set(s);
  menu.setStatus('loading…');
  return view.applySettings(s).then(settingsStatus);
}
menu.onChange = (s) => { void applySettings(s); };
menu.onResume = () => { loop.paused = false; menu.show(false); };
void view.applySettings(settings).then(settingsStatus);

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
  if (a === 'pause') { loop.paused = !menu.open; menu.show(loop.paused); if (menu.open) settingsStatus(); }
  if (a === 'mute') sound.toggleMute();
};

window.addEventListener('resize', () => view.resize());
view.updateCamera(true);

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

installApi({ sim, view, input, loop, errors, stepSim, renderFrame, hud, sound, CFG, menu, applySettings });
