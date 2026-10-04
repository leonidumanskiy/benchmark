// Browser input -> Sim.input. Real keyboard/mouse events; aim is re-projected every frame from the cursor.
import { Sim } from './sim/sim';
import { GameView } from './render/view';

export class InputController {
  keys = new Set<string>();
  mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 - 120, inside: false };
  fireHeld = false;
  firePressed = false;
  /** when set (via API), overrides the mouse-derived aim point */
  aimOverride: { x: number; z: number } | null = null;
  moveOverride: { x: number; y: number } | null = null;
  fireOverride: boolean | null = null;
  onAction: (a: 'reset' | 'debug' | 'pause' | 'mute') => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const k = e.code || e.key;
      if (k === 'KeyR') this.onAction('reset');
      else if (k === 'F3' || k === 'Backquote') { this.onAction('debug'); e.preventDefault(); }
      else if (k === 'KeyP' || k === 'Escape') this.onAction('pause');
      else if (k === 'KeyM') this.onAction('mute');
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code || e.key));
    window.addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; });
    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; this.aimOverride = null; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.fireHeld = true; this.firePressed = true; this.aimOverride = null;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.fireHeld = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  axes() {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    return { x, y };
  }

  /** Write the current input state into the simulation (called before each sim tick). */
  apply(sim: Sim, view: GameView) {
    const a = this.moveOverride ?? this.axes();
    sim.input.moveX = a.x; sim.input.moveY = a.y;
    const aim = this.aimOverride ?? view.screenToWorld(this.mouse.x, this.mouse.y);
    sim.input.aimX = aim.x; sim.input.aimZ = aim.z;
    sim.input.fire = this.fireOverride ?? this.fireHeld;
    if (this.firePressed) { sim.input.firePressed = true; this.firePressed = false; }
  }
}
