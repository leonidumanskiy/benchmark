// Compact machine interface: window.__game. State + frame + errors, control, aim, fire, step, reset.
import type { Sim } from './sim/sim';
import type { GameView } from './render/view';
import type { InputController } from './input';
import type { Hud } from './ui/hud';
import type { SoundSystem } from './audio/sound';
import type { PauseMenu } from './ui/menu';
import type { Settings } from './settings';
import { hdReady } from './assets/hd/hd';
import { computeVisibility } from './sim/visibility';
import { AIM_PLANE_Y, zoom, VIEW_HALF_HEIGHT } from './render/iso';
import { renderTurntable } from './render/turntable';
import { buildPlayer, PLAYER_SPEC } from './assets/player';
import { buildMonster, MONSTER_SPEC } from './assets/monster';

import { deepMerge } from './util';
import * as THREE from 'three';

export const BUILD_STAGE = '07-hd-assets';

interface Ctx {
  sim: Sim; view: GameView; input: InputController; hud: Hud; sound: SoundSystem;
  loop: { paused: boolean; fps: number; timeScale: number };
  errors: string[]; stepSim: (n: number) => void; renderFrame: (dt: number) => void; CFG: unknown;
  menu: PauseMenu; applySettings: (s: Settings) => Promise<void>;
}

export function installApi(c: Ctx) {
  const { sim, view, input, loop } = c;
  const api = {
    stage: BUILD_STAGE,
    sim, view, input, loop, cfg: c.CFG,
    /** compact state snapshot */
    state: () => ({ stage: BUILD_STAGE, paused: loop.paused, fps: loop.fps, debug: view.debug, ...sim.snapshot(), errors: c.errors.length }),
    errors: () => c.errors.slice(),
    events: () => sim.log.slice(),
    /** pause the real-time loop; then use step(n) for deterministic stepping */
    pause: (p = true) => { loop.paused = p; return loop.paused; },
    step: (n = 1, render = true) => { c.stepSim(n); if (render) c.renderFrame(n / 60); return render ? sim.snapshot() : null; },
    render: () => { c.renderFrame(0); return true; },
    reset: (opts: { seed?: number; waves?: boolean; player?: { x: number; z: number } } = {}) => {
      sim.reset(opts); view.onReset(); input.aimOverride = null; input.moveOverride = null; input.fireOverride = null;
      view.updateCamera(true); c.hud.reset(); c.sound.reset(); c.renderFrame(0); return sim.snapshot();
    },
    // internal-API control (tests also use real browser events)
    move: (x: number, y: number) => { input.moveOverride = x === 0 && y === 0 ? null : { x, y }; },
    aimAt: (x: number, z: number) => { input.aimOverride = { x, z }; },
    fire: (on: boolean | 'click' = 'click') => { if (on === 'click') input.firePressed = true; else input.fireOverride = on ? true : null; },
    // coordinates
    worldToScreen: (x: number, z: number, y = AIM_PLANE_Y) => { view.updateCamera(true); return view.worldToScreen(x, y, z); },
    screenToWorld: (x: number, y: number) => view.screenToWorld(x, y),
    // visibility explanation for every monster (+ arbitrary points)
    visibility: (pt?: { x: number; z: number }) => {
      const P = sim.player;
      if (pt) return computeVisibility(sim.obstacles, P.pos.x, P.pos.z, P.aimAngle, pt.x, pt.z);
      return sim.monsters.map((m) => ({ id: m.id, ...m.vis, rendered: view.isRendered(m.id) }));
    },
    /** procedural audio: per-sound play counts, context state, mute/volume control */
    audio: {
      info: () => c.sound.info(),
      mute: (on = true) => c.sound.setMuted(on),
      volume: (v: number) => c.sound.setVolume(v),
      unlock: () => { c.sound.unlock(); return c.sound.info(); },
      /** peak output level since the previous call (0 = silence) */
      peak: () => c.sound.takePeak(),
    },
    /** visual settings (same path as the pause menu): set({player:'hd', camera:'persp', ...}) resolves once HD assets are in */
    settings: {
      get: () => ({ ...view.settings }),
      set: async (patch: Partial<Settings>) => { await c.applySettings({ ...view.settings, ...patch }); c.renderFrame(0); return { ...view.settings }; },
      menu: (open?: boolean) => { if (open !== undefined) { loop.paused = open; c.menu.show(open); } return c.menu.open; },
      info: () => ({
        settings: { ...view.settings }, camera: view.camera.type, fov: (view.camera as THREE.PerspectiveCamera).fov ?? null,
        playerSkin: view.player.rig.skin, monsterSkins: [...view.monsters.values()].map((v) => v.rig.skin),
        envHd: !!view.envHd?.visible, hdError: view.hdError,
        hd: Object.fromEntries((['player', 'monster', 'envkit'] as const).map((k) => [k, hdReady(k) ? { tris: hdReady(k)!.tris, parts: hdReady(k)!.parts.size } : null])),
      }),
    },
    coverage: () => view.coverage(),
    monsterMask: (w?: number) => view.monsterMask(w),
    /** current animation state of every actor (render-side, derived from sim state) */
    anim: () => ({ player: view.player.anim, monsters: [...view.monsters.entries()].map(([id, v]) => ({ id, ...v.anim })) }),
    scene: () => ({
      obstacles: sim.obstacles.map((o) => ({ id: o.id, kind: o.kind, material: o.material, shape: o.shape, h: o.height })),
      spawns: sim.spawns, decor: sim.decor.length,
      ...view.sceneInfo(),
    }),
    debug: {
      spawn: (x: number, z: number, opts: { dummy?: boolean; hp?: number } = {}) => sim.addMonster(x, z, opts).id,
      overlay: (on: boolean) => { view.debug = on; return on; },
      fx: (on: boolean, intensity?: number) => { view.fxEnabled = on; if (intensity !== undefined) view.fx.intensity = intensity; return on; },
      post: (on: boolean) => { view.post.enabled = on; c.renderFrame(0); return on; },
      /** drone control for checks: t = patrol time (s); at = pin above a point; freeze = stop patrol clock */
      drone: (o: { t?: number; at?: { x: number; z: number } | null; freeze?: boolean } = {}) => {
        const L = view.lighting;
        if (o.t !== undefined) L.droneT = o.t;
        if (o.at !== undefined) L.droneOverride = o.at ? new THREE.Vector3(o.at.x, 0, o.at.z) : null;
        if (o.freeze !== undefined) L.droneFrozen = o.freeze;
        c.renderFrame(0);
        return L.info();
      },
      lighting: () => view.lighting.info(),
      fxStats: () => ({ ...view.fx.stats, active: view.fx.activeCount() }),
      hash: () => sim.hash(),
      /** 8-angle contact sheet (PNG data URL) of the player or monster built from the shared spec (+ optional overrides). */
      turntable: (kind: 'player' | 'monster', override?: unknown, opts: Record<string, unknown> = {}) => {
        const skin = kind === 'player' ? view.settings.player : view.settings.monster;
        const rig = kind === 'player' ? buildPlayer({ skin, ...deepMerge(PLAYER_SPEC, override) }) : buildMonster({ skin, ...deepMerge(MONSTER_SPEC, override) });
        const url = renderTurntable(view.renderer, rig.root, { closeHalf: kind === 'player' ? 1.15 : 1.6, center: kind === 'player' ? 0.95 : 0.8, ...opts });
        c.renderFrame(0);
        return url;
      },
      specs: () => ({ player: PLAYER_SPEC, monster: MONSTER_SPEC }),
      /** camera zoom for close inspection (ortho half-height in metres); no arg = default */
      zoom: (half = VIEW_HALF_HEIGHT) => { zoom.half = half; view.resize(); view.updateCamera(true); c.renderFrame(0); return half; },
      /** rebuild player/monster visuals from the shared spec with overrides (runtime model/equipment change) */
      focus: (x?: number, z?: number) => { view.focus = x === undefined ? null : { x, z: z! }; view.updateCamera(true); c.renderFrame(0); return view.focus; },
      respec: (kind: 'player' | 'monster', override: unknown) => view.respec(kind, override),
    },
  };
  (window as any).__game = api;
  return api;
}
