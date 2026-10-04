import { Sim, GameEvent } from '../sim/sim';
import { CFG } from '../sim/config';
import { GameView } from '../render/view';

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  private bannerT = 0;
  private reticle = $('reticle');
  private dmg = $('damage');
  private hitT = 0; private killT = 0; private dmgT = 0;

  reset() { this.banner('', 0); this.hitT = this.killT = this.dmgT = 0; }

  banner(html: string, secs: number) {
    const b = $('banner');
    b.innerHTML = html; b.classList.toggle('show', !!html); this.bannerT = secs;
  }

  update(sim: Sim, events: GameEvent[], view: GameView) {
    const P = sim.player;
    $('hp-fill').style.width = `${(P.hp / CFG.player.hp) * 100}%`;
    $('hp-num').textContent = String(P.hp);
    $('kill-num').textContent = String(sim.stats.kills);
    const alive = sim.monsters.filter((m) => m.state !== 'dead' && m.state !== 'dummy').length;
    if (sim.phase === 'sandbox') { $('wave-label').textContent = 'SANDBOX'; $('wave-sub').textContent = ''; }
    else {
      $('wave-label').textContent = `WAVE ${Math.max(1, sim.wave)} / ${CFG.waves.length}`;
      $('wave-sub').textContent = sim.phase === 'wave' ? `HOSTILES ${alive + sim.toSpawn}` : sim.phase === 'pre' || sim.phase === 'intermission' ? 'INCOMING' : '';
    }
    for (const e of events) {
      if (e.type === 'wave_start') this.banner(`WAVE ${e.wave}<small>THEY ARE COMING THROUGH THE GATES</small>`, 2.2);
      if (e.type === 'wave_clear' && e.wave < CFG.waves.length) this.banner(`WAVE ${e.wave} CLEARED`, 2);
      if (e.type === 'victory') this.banner('ARENA SECURED<small>PRESS R TO RESTART</small>', 1e9);
      if (e.type === 'defeat') this.banner('SIGNAL LOST<small>PRESS R TO RESTART</small>', 1e9);
      if (e.type === 'monster_hit') this.hitT = 0.12;
      if (e.type === 'monster_killed') this.killT = 0.3;
      if (e.type === 'player_hit') this.dmgT = 0.45;
    }
    const dt = 1 / 60;
    this.hitT = Math.max(0, this.hitT - dt); this.killT = Math.max(0, this.killT - dt); this.dmgT = Math.max(0, this.dmgT - dt);
    this.reticle.classList.toggle('hit', this.hitT > 0);
    this.reticle.classList.toggle('kill', this.killT > 0);
    this.dmg.style.opacity = String(Math.min(1, this.dmgT / 0.3));
    if (this.bannerT > 0) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) this.banner('', 0); }
    // reticle follows the real cursor (or the API aim point)
    const inp = (window as any).__game?.input;
    if (inp) {
      let x = inp.mouse.x, y = inp.mouse.y;
      if (inp.aimOverride) { const s = view.worldToScreen(inp.aimOverride.x, 0.9, inp.aimOverride.z); x = s.x; y = s.y; }
      this.reticle.style.left = `${x}px`; this.reticle.style.top = `${y}px`;
    }
    const dp = $('debug-panel');
    dp.style.display = view.debug ? 'block' : 'none';
    if (view.debug) {
      const g = (window as any).__game;
      dp.textContent = `fps ${g?.loop.fps} tick ${sim.tick} phase ${sim.phase} wave ${sim.wave}\n` +
        `player ${P.pos.x.toFixed(2)},${P.pos.z.toFixed(2)} aim ${((P.aimAngle * 180) / Math.PI).toFixed(1)}°\n` +
        sim.monsters.map((m) => `${m.id} ${m.state.padEnd(7)} hp${String(m.hp).padStart(3)} ${m.vis.visible ? 'VIS' : 'hid'} ${m.vis.reason}${m.vis.occluder ? '>' + m.vis.occluder : ''}`).join('\n');
    }
  }
}
