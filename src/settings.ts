// User-facing visual settings (pause menu). Persisted per browser; URL params override (?player=hd&monster=hd&env=hd&camera=persp&focal=135).
// Purely presentational: none of these touch the simulation.
export interface Settings {
  player: 'classic' | 'hd';
  monster: 'classic' | 'hd';
  env: 'classic' | 'hd';
  /** 'iso' = orthographic isometric; 'persp' = weak perspective (fixed yaw/pitch, long lens) */
  camera: 'iso' | 'persp';
  /** full-frame-equivalent focal length of the weak-perspective lens, mm */
  focal: number;
}

export const DEFAULT_SETTINGS: Settings = { player: 'classic', monster: 'classic', env: 'classic', camera: 'iso', focal: 135 };
export const FOCALS = [85, 135, 200];
const KEY = 'kepler.settings.v1';

export function loadSettings(params = new URLSearchParams(location.search)): Settings {
  let s: Settings = { ...DEFAULT_SETTINGS };
  try { const raw = localStorage.getItem(KEY); if (raw) s = { ...s, ...JSON.parse(raw) }; } catch { /* storage unavailable */ }
  const pick = <K extends keyof Settings>(k: K, ok: (v: string) => boolean, conv: (v: string) => Settings[K]) => { const v = params.get(k); if (v !== null && ok(v)) s[k] = conv(v); };
  pick('player', (v) => v === 'classic' || v === 'hd', (v) => v as Settings['player']);
  pick('monster', (v) => v === 'classic' || v === 'hd', (v) => v as Settings['monster']);
  pick('env', (v) => v === 'classic' || v === 'hd', (v) => v as Settings['env']);
  pick('camera', (v) => v === 'iso' || v === 'persp', (v) => v as Settings['camera']);
  pick('focal', (v) => Number(v) >= 35 && Number(v) <= 600, (v) => Number(v));
  if (params.get('hd') === '1') { s.player = 'hd'; s.monster = 'hd'; s.env = 'hd'; }
  return sanitize(s);
}

export function sanitize(s: Settings): Settings {
  return {
    player: s.player === 'hd' ? 'hd' : 'classic', monster: s.monster === 'hd' ? 'hd' : 'classic', env: s.env === 'hd' ? 'hd' : 'classic',
    camera: s.camera === 'persp' ? 'persp' : 'iso', focal: Number.isFinite(s.focal) ? Math.min(600, Math.max(35, s.focal)) : 135,
  };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
