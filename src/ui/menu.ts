// Pause menu with visual settings. Opened with Esc / P (real key) — the machine API's pause() does not show it.
import { Settings, FOCALS } from '../settings';

type Opt = { value: string; label: string };
const GROUPS: { key: keyof Settings; label: string; opts: Opt[]; hint?: string }[] = [
  { key: 'player', label: 'Player model', opts: [{ value: 'classic', label: 'Classic' }, { value: 'hd', label: 'HD asset' }] },
  { key: 'monster', label: 'Monster model', opts: [{ value: 'classic', label: 'Classic' }, { value: 'hd', label: 'HD asset' }] },
  { key: 'env', label: 'Environment', opts: [{ value: 'classic', label: 'Classic' }, { value: 'hd', label: 'HD kit' }] },
  { key: 'camera', label: 'Camera', opts: [{ value: 'iso', label: 'Isometric' }, { value: 'persp', label: 'Weak perspective' }] },
  { key: 'focal', label: 'Lens (weak perspective)', opts: FOCALS.map((f) => ({ value: String(f), label: `${f} mm` })) },
];

export class PauseMenu {
  readonly el: HTMLDivElement;
  private status: HTMLDivElement;
  open = false;
  onChange: (s: Settings) => void = () => {};
  onResume: () => void = () => {};

  constructor(private settings: Settings) {
    const el = document.createElement('div');
    el.id = 'pause-menu';
    el.innerHTML = `<div class="pm-panel"><div class="pm-title">PAUSED</div><div class="pm-sub">VISUAL SETTINGS</div><div class="pm-groups"></div>
      <div class="pm-status"></div><button class="pm-resume" type="button">RESUME</button><div class="pm-keys">Esc / P — resume · settings are saved in this browser</div></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.status = el.querySelector('.pm-status')!;
    const groups = el.querySelector('.pm-groups')!;
    for (const g of GROUPS) {
      const row = document.createElement('div'); row.className = 'pm-row'; row.dataset.group = g.key;
      row.innerHTML = `<div class="pm-label">${g.label}</div><div class="pm-seg">${g.opts.map((o) => `<button type="button" data-setting="${g.key}" data-value="${o.value}">${o.label}</button>`).join('')}</div>`;
      groups.appendChild(row);
    }
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.classList.contains('pm-resume')) { this.onResume(); return; }
      const key = b.dataset.setting as keyof Settings, v = b.dataset.value!;
      const next = { ...this.settings, [key]: key === 'focal' ? Number(v) : v } as Settings;
      this.settings = next;
      this.sync();
      this.onChange(next);
    });
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.sync();
  }

  set(s: Settings) { this.settings = s; this.sync(); }

  setStatus(text: string) { this.status.textContent = text; }

  show(on: boolean) { this.open = on; this.el.classList.toggle('show', on); document.body.classList.toggle('menu-open', on); }

  private sync() {
    this.el.querySelectorAll<HTMLButtonElement>('button[data-setting]').forEach((b) => {
      const k = b.dataset.setting as keyof Settings;
      b.classList.toggle('on', String(this.settings[k]) === b.dataset.value);
    });
    (this.el.querySelector('[data-group="focal"]') as HTMLElement).classList.toggle('disabled', this.settings.camera !== 'persp');
  }
}
