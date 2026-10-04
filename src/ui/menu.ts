// Pause menu (P / Esc): presentation settings — player / monster / environment variants and camera projection.
// Opening it pauses the simulation; API pause (__game.pause) never opens it, so evidence frames stay clean.
import { Settings, OPTIONS, ALL_NEW, DEFAULT_SETTINGS } from '../settings';
import { focalLength35 } from '../render/iso';

type Apply = (patch: Partial<Settings>) => Promise<void>;

export class PauseMenu {
  readonly el: HTMLDivElement;
  open = false;
  busy = false;
  private status: HTMLDivElement;

  constructor(private get: () => Settings, private apply: Apply, private onToggle: (open: boolean) => void) {
    const el = document.createElement('div');
    el.id = 'pause-menu';
    el.innerHTML = `<div class="pm-card">
      <div class="pm-title">PAUSED</div>
      <div class="pm-sub">VISUAL SETTINGS · gameplay is unaffected</div>
      <div class="pm-rows"></div>
      <div class="pm-row pm-fov"><span class="pm-label">Lens (weak perspective)</span>
        <input type="range" id="pm-fov" min="6" max="30" step="1"><span id="pm-fov-v"></span></div>
      <div class="pm-actions">
        <button data-preset="new">All new assets</button>
        <button data-preset="classic">All classic</button>
        <button data-act="resume" class="pm-primary">Resume (P / Esc)</button>
      </div>
      <div class="pm-status"></div>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.status = el.querySelector('.pm-status') as HTMLDivElement;
    const rows = el.querySelector('.pm-rows')!;
    const labels: Record<string, string> = { player: 'Player', monster: 'Monster', env: 'Environment', camera: 'Camera' };
    for (const key of Object.keys(OPTIONS) as (keyof typeof OPTIONS)[]) {
      const row = document.createElement('div');
      row.className = 'pm-row';
      row.innerHTML = `<span class="pm-label">${labels[key]}</span><div class="pm-seg" data-key="${key}">` +
        OPTIONS[key].map(([v, l]) => `<button data-key="${key}" data-val="${v}">${l}</button>`).join('') + '</div>';
      rows.appendChild(row);
    }
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || this.busy) return;
      if (b.dataset.act === 'resume') return this.toggle(false);
      if (b.dataset.preset === 'new') return void this.set({ ...ALL_NEW, camera: 'persp' });
      if (b.dataset.preset === 'classic') return void this.set({ player: DEFAULT_SETTINGS.player, monster: DEFAULT_SETTINGS.monster, env: DEFAULT_SETTINGS.env, camera: 'ortho' });
      if (b.dataset.key) void this.set({ [b.dataset.key]: b.dataset.val } as Partial<Settings>);
    });
    const fov = el.querySelector('#pm-fov') as HTMLInputElement;
    fov.addEventListener('input', () => void this.set({ fov: Number(fov.value) }));
    this.refresh();
  }

  async set(patch: Partial<Settings>) {
    this.busy = true; this.el.classList.add('busy');
    this.status.textContent = 'loading assets…';
    try { await this.apply(patch); this.status.textContent = ''; }
    catch (e) { this.status.textContent = 'failed: ' + String((e as Error).message ?? e); }
    finally { this.busy = false; this.el.classList.remove('busy'); this.refresh(); }
  }

  refresh() {
    const s = this.get();
    this.el.querySelectorAll<HTMLButtonElement>('.pm-seg button').forEach((b) => b.classList.toggle('on', (s as any)[b.dataset.key!] === b.dataset.val));
    const fov = this.el.querySelector('#pm-fov') as HTMLInputElement;
    fov.value = String(s.fov);
    (this.el.querySelector('#pm-fov-v') as HTMLElement).textContent = `${s.fov}° · ≈${Math.round(focalLength35(s.fov))} mm`;
    this.el.querySelector('.pm-fov')!.classList.toggle('dim', s.camera !== 'persp');
  }

  toggle(open = !this.open) {
    this.open = open;
    this.el.classList.toggle('show', open);
    document.body.classList.toggle('menu-open', open);
    this.refresh();
    this.onToggle(open);
  }
}
