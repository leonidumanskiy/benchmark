// Procedural sound: every sound is synthesized with Web Audio from code (no audio files), so it is reproducible
// and tweakable like the rest of the assets. Render-side only: consumes sim events, never touches sim state.
// The AudioContext is created on the first user gesture (browser autoplay policy); before that, sounds are counted but silent.
import { Sim, GameEvent, ISO_RIGHT, Shot } from '../sim/sim';
import { CFG } from '../sim/config';

type Mat = Shot['material'];

export interface SoundStats { played: Record<string, number>; ctx: string; muted: boolean; volume: number }

export class SoundSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private comp!: DynamicsCompressorNode;
  private meter!: AnalyserNode;
  private peak = 0;
  private noise!: AudioBuffer;
  private ambient: { gain: GainNode; stop: () => void } | null = null;
  muted = false;
  volume = 0.7;
  stats: SoundStats['played'] = {};
  private stepDist = 0;
  private lastPos: { x: number; z: number } | null = null;
  private lastPlayed = new Map<string, number>();

  constructor(private sim: Sim) {
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });
  }

  /** create/resume the AudioContext (must happen inside a user gesture) */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.build();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    } catch { this.ctx = null; }
  }

  private build() {
    const c = this.ctx!;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 10; this.comp.ratio.value = 6;
    this.comp.attack.value = 0.002; this.comp.release.value = 0.15;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
    this.sfx = c.createGain(); this.sfx.gain.value = 1;
    this.sfx.connect(this.comp); this.comp.connect(this.master); this.master.connect(c.destination);
    this.meter = c.createAnalyser(); this.meter.fftSize = 1024; this.comp.connect(this.meter);
    // shared 2s white-noise buffer, sliced at random offsets
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
    return m;
  }
  toggleMute() { return this.setMuted(!this.muted); }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); if (!this.muted) this.setMuted(false); return this.volume; }

  info(): SoundStats & { peak: number } { return { played: { ...this.stats }, ctx: this.ctx?.state ?? 'none', muted: this.muted, volume: this.volume, peak: Math.round(this.peak * 1000) / 1000 }; }

  /** peak output amplitude since the last call (pre-mute), sampled each frame: proves sound is actually produced */
  private sampleMeter() {
    if (!this.meter) return;
    const buf = new Float32Array(this.meter.fftSize); this.meter.getFloatTimeDomainData(buf);
    let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v));
    this.peak = Math.max(this.peak, m);
  }
  takePeak() { const p = this.peak; this.peak = 0; return Math.round(p * 1000) / 1000; }

  reset() { this.stepDist = 0; this.lastPos = null; this.lastPlayed.clear(); }

  // ---------------------------------------------------------------- event dispatch
  update(dt: number, events: GameEvent[]) {
    const sim = this.sim;
    this.sampleMeter();
    for (const e of events) {
      switch (e.type) {
        case 'shot': this.play('shot', () => this.gunshot()); if (e.shot.hitKind !== 'monster' && e.shot.hitKind !== 'none') this.play('impact_' + e.shot.material, () => this.impact(e.shot.material, e.shot.to), 0.03); break;
        case 'monster_hit': { const m = this.monster(e.id); this.play('monster_hit', () => this.fleshHit(m)); break; }
        case 'monster_killed': { const m = this.monster(e.id); this.play('monster_killed', () => this.death(m)); break; }
        case 'monster_spawn': { const m = this.monster(e.id); this.play('monster_spawn', () => this.growl(m), 0.15); break; }
        case 'monster_attack': { const m = this.monster(e.id); this.play('monster_attack', () => this.swipe(m)); break; }
        case 'player_hit': this.play('player_hit', () => this.playerHurt()); break;
        case 'wave_start': this.play('wave_start', () => this.alarm()); break;
        case 'wave_clear': if (e.wave < CFG.waves.length) this.play('wave_clear', () => this.chime([523, 659, 784])); break;
        case 'victory': this.play('victory', () => this.chime([523, 659, 784, 1047], 0.13, 1.4)); break;
        case 'defeat': this.play('defeat', () => this.defeatSting()); break;
      }
    }
    // footsteps from distance actually travelled (not from input), so blocked movement stays quiet
    const P = sim.player.pos;
    if (this.lastPos && sim.player.alive && dt > 0) {
      const d = Math.hypot(P.x - this.lastPos.x, P.z - this.lastPos.z);
      if (d < 1) { this.stepDist += d; if (this.stepDist > 1.05) { this.stepDist = 0; this.play('step', () => this.footstep()); } }
    }
    this.lastPos = { x: P.x, z: P.z };
  }

  /** count + rate-limit; `gap` = minimum seconds between two plays of the same sound */
  private play(name: string, fn: () => void, gap = 0) {
    this.stats[name] = (this.stats[name] ?? 0) + 1;
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (gap > 0 && t - (this.lastPlayed.get(name) ?? -1) < gap) return;
    this.lastPlayed.set(name, t);
    try { fn(); } catch { /* audio must never break the frame */ }
  }

  private monster(id: string) { return this.sim.monsters.find((m) => m.id === id)?.pos ?? null; }

  // ---------------------------------------------------------------- spatialisation (screen-space pan + distance falloff)
  private out(pos: { x: number; z: number } | null, gain = 1): AudioNode {
    const c = this.ctx!;
    const g = c.createGain();
    let vol = gain, pan = 0;
    if (pos) {
      const P = this.sim.player.pos;
      const dx = pos.x - P.x, dz = pos.z - P.z;
      pan = Math.max(-0.85, Math.min(0.85, (dx * ISO_RIGHT.x + dz * ISO_RIGHT.z) / 12));
      vol *= 1 / (1 + Math.hypot(dx, dz) / 9);
    }
    g.gain.value = vol;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }

  // ---------------------------------------------------------------- primitives
  private noiseSrc(dur: number) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.start(this.ctx!.currentTime, Math.random() * 1.5, dur + 0.05);
    return s;
  }
  private filter(type: BiquadFilterType, freq: number, q = 1) {
    const f = this.ctx!.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f;
  }
  /** gain envelope: fast attack, exponential decay */
  private env(peak: number, attack: number, decay: number, at = 0) {
    const c = this.ctx!, g = c.createGain(), t = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  private osc(type: OscillatorType, f0: number, f1: number, dur: number, at = 0) {
    const c = this.ctx!, o = c.createOscillator(), t = c.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  private chain(...n: AudioNode[]) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); }
  private jitter(k = 0.06) { return 1 + (Math.random() * 2 - 1) * k; }

  // ---------------------------------------------------------------- sounds
  /** pulse rifle: noisy crack + low body thump + short metallic zap */
  private gunshot() {
    const j = this.jitter(), o = this.out(null, 0.55);
    this.chain(this.noiseSrc(0.12), this.filter('bandpass', 2400 * j, 0.8), this.env(0.9, 0.002, 0.09), o);
    this.chain(this.noiseSrc(0.25), this.filter('lowpass', 900 * j), this.env(0.6, 0.003, 0.2), o);
    this.chain(this.osc('sine', 150 * j, 45, 0.14), this.env(1.0, 0.002, 0.13), o);
    this.chain(this.osc('square', 1600 * j, 380, 0.06), this.filter('lowpass', 3000), this.env(0.12, 0.001, 0.05), o);
  }

  private impact(mat: Mat, pos: { x: number; z: number }) {
    const j = this.jitter(0.1), o = this.out(pos, 0.5);
    if (mat === 'metal') {
      // ricochet ping: inharmonic partials with a quick tick
      for (const [f, a] of [[2100, 0.25], [3370, 0.15], [5230, 0.08]] as const) this.chain(this.osc('sine', f * j, f * j * 0.97, 0.3), this.env(a, 0.001, 0.25), o);
      this.chain(this.noiseSrc(0.03), this.filter('highpass', 4000), this.env(0.5, 0.001, 0.025), o);
    } else {
      // stone: gritty crunch + debris patter
      this.chain(this.noiseSrc(0.15), this.filter('bandpass', 1100 * j, 0.7), this.env(0.7, 0.002, 0.12), o);
      this.chain(this.noiseSrc(0.3), this.filter('bandpass', 3200, 2), this.env(0.15, 0.03, 0.2, 0.02), o);
    }
  }

  /** wet hit on the creature + hit-marker tick for player feedback */
  private fleshHit(pos: { x: number; z: number } | null) {
    const j = this.jitter(0.12), o = this.out(pos, 0.7);
    this.chain(this.noiseSrc(0.16), this.filter('lowpass', 700 * j, 3), this.env(0.9, 0.003, 0.13), o);
    this.chain(this.osc('sine', 220 * j, 90, 0.1), this.env(0.6, 0.002, 0.09), o);
    this.chain(this.osc('triangle', 1900, 1900, 0.04), this.env(0.08, 0.001, 0.035), this.out(null, 1));
  }

  /** alien screech falling into a gurgle */
  private death(pos: { x: number; z: number } | null) {
    const j = this.jitter(0.12), o = this.out(pos, 0.8);
    const lfo = this.ctx!.createOscillator(), lg = this.ctx!.createGain();
    lfo.frequency.value = 28; lg.gain.value = 60; lfo.connect(lg);
    const s = this.osc('sawtooth', 640 * j, 120, 0.6);
    lg.connect(s.frequency); lfo.start(); lfo.stop(this.ctx!.currentTime + 0.7);
    this.chain(s, this.filter('bandpass', 1300, 1.5), this.env(0.45, 0.01, 0.55), o);
    this.chain(this.noiseSrc(0.4), this.filter('lowpass', 500, 4), this.env(0.6, 0.01, 0.35, 0.05), o);
    // kill confirm (non-spatial): two short bright blips
    const u = this.out(null, 1);
    this.chain(this.osc('triangle', 1320, 1320, 0.05), this.env(0.08, 0.001, 0.05), u);
    this.chain(this.osc('triangle', 1760, 1760, 0.05, 0.06), this.env(0.08, 0.001, 0.06, 0.06), u);
  }

  /** low guttural growl as a monster emerges from its lair */
  private growl(pos: { x: number; z: number } | null) {
    const j = this.jitter(0.15), o = this.out(pos, 0.9);
    const lfo = this.ctx!.createOscillator(), lg = this.ctx!.createGain();
    lfo.frequency.value = 11 * j; lg.gain.value = 18; lfo.connect(lg);
    const s = this.osc('sawtooth', 85 * j, 62, 0.9);
    lg.connect(s.frequency); lfo.start(); lfo.stop(this.ctx!.currentTime + 1);
    this.chain(s, this.filter('lowpass', 520, 6), this.env(0.6, 0.12, 0.75), o);
    this.chain(this.noiseSrc(0.9), this.filter('bandpass', 380, 3), this.env(0.25, 0.15, 0.7), o);
  }

  /** claw swipe: band-passed noise sweeping upward */
  private swipe(pos: { x: number; z: number } | null) {
    const c = this.ctx!, o = this.out(pos, 0.8), t = c.currentTime;
    const f = this.filter('bandpass', 500, 2.5);
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.16);
    this.chain(this.noiseSrc(0.22), f, this.env(0.7, 0.04, 0.16), o);
    this.chain(this.osc('sawtooth', 160, 110, 0.25), this.filter('lowpass', 400), this.env(0.25, 0.02, 0.2), o);
  }

  /** player takes damage: armor crunch + heavy body thump + warning buzz */
  private playerHurt() {
    const o = this.out(null, 0.9);
    this.chain(this.osc('sine', 110, 40, 0.25), this.env(1.0, 0.003, 0.22), o);
    this.chain(this.noiseSrc(0.2), this.filter('bandpass', 1600, 1.2), this.env(0.5, 0.002, 0.15), o);
    this.chain(this.osc('square', 180, 175, 0.18, 0.04), this.filter('lowpass', 900), this.env(0.15, 0.005, 0.15, 0.04), o);
  }

  private footstep() {
    const j = this.jitter(0.15), o = this.out(null, 0.22);
    this.chain(this.noiseSrc(0.08), this.filter('bandpass', 320 * j, 1.5), this.env(0.6, 0.004, 0.07), o);
    this.chain(this.noiseSrc(0.05), this.filter('highpass', 3500), this.env(0.12, 0.002, 0.04, 0.01), o);
  }

  /** two-tone klaxon */
  private alarm() {
    const o = this.out(null, 0.35);
    for (let i = 0; i < 4; i++) {
      const f = i % 2 ? 587 : 784;
      this.chain(this.osc('square', f, f, 0.2, i * 0.22), this.filter('lowpass', 2200), this.env(0.35, 0.01, 0.19, i * 0.22), o);
    }
  }

  private chime(notes: number[], step = 0.1, tail = 0.6) {
    const o = this.out(null, 0.35);
    notes.forEach((f, i) => {
      const at = i * step;
      this.chain(this.osc('triangle', f, f, tail + 0.1, at), this.env(0.4, 0.005, tail, at), o);
      this.chain(this.osc('sine', f * 2, f * 2, tail, at), this.env(0.1, 0.005, tail * 0.7, at), o);
    });
  }

  private defeatSting() {
    const o = this.out(null, 0.5);
    for (const [f, d] of [[220, 0], [207, 0.02], [110, 0.04]] as const) this.chain(this.osc('sawtooth', f, f * 0.5, 1.8, d), this.filter('lowpass', 700), this.env(0.3, 0.02, 1.7, d), o);
  }

  /** looping dark ambience: wind (filtered noise with slow sweep) + sub hum */
  private startAmbient() {
    const c = this.ctx!, g = c.createGain();
    g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 3);
    g.connect(this.comp);
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const f = this.filter('lowpass', 380, 0.7);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency);
    const ng = c.createGain(); ng.gain.value = 0.12;
    this.chain(n, f, ng, g);
    const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 55;
    const hum2 = c.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 82.6;
    const hg = c.createGain(); hg.gain.value = 0.05;
    hum.connect(hg); hum2.connect(hg); hg.connect(g);
    n.start(); lfo.start(); hum.start(); hum2.start();
    this.ambient = { gain: g, stop: () => { for (const s of [n, lfo, hum, hum2]) s.stop(); } };
  }
}
