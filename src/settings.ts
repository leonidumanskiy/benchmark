// Visual settings (pause menu). Purely presentation: none of these touch the simulation.
// Sources, lowest to highest priority: defaults -> localStorage -> URL params (?player=&monster=&env=&cam=&fov=).
import { PERSP_DEFAULT_FOV } from './render/iso';

export type PlayerVariant = 'classic' | 'vanguard';
export type MonsterVariant = 'classic' | 'reaver';
export type EnvVariant = 'classic' | 'kit2';
export type CameraMode = 'ortho' | 'persp';

export interface Settings { player: PlayerVariant; monster: MonsterVariant; env: EnvVariant; camera: CameraMode; fov: number }

export const DEFAULT_SETTINGS: Settings = { player: 'classic', monster: 'classic', env: 'classic', camera: 'ortho', fov: PERSP_DEFAULT_FOV };
export const ALL_NEW: Partial<Settings> = { player: 'vanguard', monster: 'reaver', env: 'kit2' };

export const OPTIONS = {
  player: [['classic', 'Ranger (classic)'], ['vanguard', 'Vanguard (new)']],
  monster: [['classic', 'Ravager (classic)'], ['reaver', 'Reaver (new)']],
  env: [['classic', 'Classic primitives'], ['kit2', 'Outpost kit (new)']],
  camera: [['ortho', 'Isometric (orthographic)'], ['persp', 'Weak perspective']],
} as const;

const KEY = 'b02.settings.v1';

export function sanitize(s: Partial<Settings>): Settings {
  const o = { ...DEFAULT_SETTINGS, ...s } as Settings;
  const ok = <K extends keyof typeof OPTIONS>(k: K) => (OPTIONS[k] as readonly (readonly string[])[]).some(([v]) => v === o[k]);
  for (const k of Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]) if (!ok(k)) (o as any)[k] = DEFAULT_SETTINGS[k];
  o.fov = Math.min(30, Math.max(6, Number(o.fov) || PERSP_DEFAULT_FOV));
  return o;
}

export function loadSettings(params: URLSearchParams): Settings {
  let stored: Partial<Settings> = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { /* storage unavailable */ }
  const url: Partial<Settings> = {};
  if (params.get('all') === 'new') Object.assign(url, ALL_NEW);
  const p = params.get('player'); if (p) url.player = p as PlayerVariant;
  const m = params.get('monster'); if (m) url.monster = m as MonsterVariant;
  const e = params.get('env'); if (e) url.env = e as EnvVariant;
  const c = params.get('cam'); if (c) url.camera = c as CameraMode;
  const f = params.get('fov'); if (f) url.fov = Number(f);
  return sanitize({ ...stored, ...url });
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
