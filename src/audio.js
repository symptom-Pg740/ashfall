/**
 * Procedural weapon audio. No asset files: each shot is a filtered noise crack plus a pitched
 * thump, synthesised on demand from a pre-baked noise buffer.
 *
 * The context can only start from a user gesture, so `start()` is called from the start button.
 */
const SHOTS = {
  pistol: { dur: 0.17, crack: 2400, q: 0.9, noise: 0.55, thump: 180, thumpGain: 0.5 },
  rifle: { dur: 0.34, crack: 1500, q: 0.7, noise: 0.75, thump: 110, thumpGain: 0.8 },
  shotgun: { dur: 0.4, crack: 900, q: 0.5, noise: 0.9, thump: 85, thumpGain: 0.95 },
};

export class AudioFx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      const frames = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < frames; i++) {
        // Slightly smoothed white noise reads more like powder than pure static.
        const white = Math.random() * 2 - 1;
        last = last * 0.35 + white * 0.65;
        data[i] = last;
      }
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  /**
   * @param {string} kind weapon id
   * @param {number} distance metres from the listener; distant shots are quieter and duller
   */
  shot(kind = 'pistol', distance = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const cfg = SHOTS[kind] || SHOTS.pistol;
    const t = this.ctx.currentTime;
    const near = 1 / (1 + distance / 22);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;

    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = cfg.crack * (0.82 + Math.random() * 0.36);
    band.Q.value = cfg.q;

    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 5200 - Math.min(3200, distance * 140);

    const gain = this.ctx.createGain();
    const peak = cfg.noise * near;
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + cfg.dur);

    src.connect(band).connect(low).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + cfg.dur + 0.02);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(cfg.thump, t);
    osc.frequency.exponentialRampToValueAtTime(cfg.thump * 0.42, t + cfg.dur * 0.9);

    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(cfg.thumpGain * near, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.0008, t + cfg.dur * 0.95);

    osc.connect(thumpGain).connect(this.master);
    osc.start(t);
    osc.stop(t + cfg.dur);
  }

  /** A dull mechanical click for a dry trigger or an empty pouch. */
  click() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'highpass';
    band.frequency.value = 2600;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.04);
    src.connect(band).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.06);
  }

  /**
   * A short, cheap brass tick when a casing lands — used only for the player's own weapon so the
   * sound does not turn into a rattle in a firefight.
   */
  casing() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1300 + Math.random() * 500, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}
