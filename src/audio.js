/**
 * Procedural weapon and world audio. No audio assets.
 *
 * The design follows the standard game-audio gunshot template — transient, body, crack, sub,
 * mechanical and tail — instead of the old single noise burst:
 *
 *   transient : sub-millisecond noise click that tells the ear "now"
 *   body      : saturated low-mid noise, the chest of the report
 *   crack     : band-passed noise, the supersonic N-wave / calibre signature
 *   sub       : pitched sine sweep, the pressure wave you feel
 *   mech      : dry metallic action, slightly late so it reads as a mechanism
 *   tail      : convolution reverb from a generated impulse response (open desert)
 *
 * Variation: each weapon owns four pre-jittered variants that are picked round-robin, plus
 * per-shot random pitch/filter jitter, so repeated fire does not machine-gun.
 *
 * Space: distance scales gain, removes the highs (air absorption), delays the whole shot by
 * `distance / 343` and lets the wet tail carry. A master compressor keeps a firefight from
 * clipping. The audio context can only start from a user gesture.
 */

const SPEED_OF_SOUND = 343;

const NOISE_SECONDS = 2;

/** Tunings per weapon. Frequencies in Hz, times in seconds. */
const SHOTS = {
  pistol: {
    gain: 0.62,
    transient: { dur: 0.012, hp: 2400, gain: 0.7 },
    body: { lp: 1900, lpEnd: 420, dur: 0.13, gain: 0.75, drive: 2.2 },
    crack: { freq: 2900, freqEnd: 2100, q: 1.1, dur: 0.055, gain: 0.5 },
    sub: { from: 155, to: 54, dur: 0.17, gain: 0.5 },
    mech: { delay: 0.032, freq: 2300, q: 7, dur: 0.07, gain: 0.16 },
    tail: 0.2,
    distant: 0.5,
  },
  rifle: {
    gain: 0.78,
    transient: { dur: 0.014, hp: 1900, gain: 0.9 },
    body: { lp: 1500, lpEnd: 300, dur: 0.2, gain: 0.95, drive: 3.4 },
    crack: { freq: 2100, freqEnd: 1300, q: 0.9, dur: 0.075, gain: 0.85 },
    sub: { from: 120, to: 38, dur: 0.26, gain: 0.85 },
    mech: { delay: 0.045, freq: 1900, q: 6, dur: 0.09, gain: 0.2 },
    tail: 0.34,
    distant: 0.85,
  },
  shotgun: {
    gain: 0.92,
    transient: { dur: 0.016, hp: 1500, gain: 0.8 },
    body: { lp: 1100, lpEnd: 200, dur: 0.28, gain: 1.0, drive: 4.2 },
    crack: { freq: 1400, freqEnd: 800, q: 0.6, dur: 0.09, gain: 0.6 },
    sub: { from: 100, to: 32, dur: 0.33, gain: 1.0 },
    mech: { delay: 0.06, freq: 1500, q: 5, dur: 0.11, gain: 0.24 },
    tail: 0.46,
    distant: 1.0,
  },
};

const IMPACTS = {
  sand: { click: 0.12, clickHp: 900, body: 70, bodyGain: 0.5, bodyDur: 0.12, tex: 'brown', texLp: 1500, texGain: 0.5, texDur: 0.16, debris: 0 },
  stone: { click: 0.4, clickHp: 2600, body: 130, bodyGain: 0.45, bodyDur: 0.09, tex: 'white', texLp: 5200, texGain: 0.45, texDur: 0.1, debris: 4 },
  metal: { click: 0.5, clickHp: 3200, body: 220, bodyGain: 0.35, bodyDur: 0.06, tex: 'white', texLp: 7000, texGain: 0.35, texDur: 0.08, debris: 0, ring: [1850, 2790] },
  wood: { click: 0.3, clickHp: 1700, body: 100, bodyGain: 0.5, bodyDur: 0.1, tex: 'pink', texLp: 2600, texGain: 0.4, texDur: 0.09, debris: 2 },
  flesh: { click: 0.05, clickHp: 500, body: 65, bodyGain: 0.6, bodyDur: 0.14, tex: 'brown', texLp: 900, texGain: 0.55, texDur: 0.18, debris: 0 },
};

const QUALITY = {
  high: { layers: true, reverb: true, wind: true },
  balanced: { layers: true, reverb: true, wind: true },
  low: { layers: false, reverb: false, wind: false },
};

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export class AudioFx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.dryBus = null;
    this.wet = null;
    this.convolver = null;
    this.noise = {};
    this.variants = {};
    this.shotSamples = { pistol: [], rifle: [], shotgun: [] };
    this._sampleIndex = {};
    this.muted = false;
    this.quality = 'high';
    this.started = false;
    this._shotIndex = {};
    this._wind = null;
    this._stepIndex = 0;
    try {
      this.muted = localStorage.getItem('ashfall-audio-muted') === '1';
    } catch {
      /* ignore */
    }
  }

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;

    // A compressor on the whole bus: layered shots stack, and a raid must not clip.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 7;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.16;

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1;
    this.dryBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Shared reverb: generated IR, wet return with a gentle low-pass.
    this.convolver = ctx.createConvolver();
    this.convolver.normalize = false;
    this.convolver.buffer = this._makeIR(1.5);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.convolver.connect(this.wet).connect(this.comp);

    this._makeNoise('white');
    this._makeNoise('pink');
    this._makeNoise('brown');
    this._makeVariants();
    this._loadSamples();

    this.started = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (QUALITY[this.quality].wind) this._startWind();
  }

  pause() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try {
      localStorage.setItem('ashfall-audio-muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.quality = name;
    if (!this.ctx) return;
    if (!q.wind) this._stopWind();
    else if (this.started && !this._wind) this._startWind();
  }

  get available() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * Load the optional recorded close layer. Missing files are not an error: the synth fallback
   * stays in place per weapon.
   */
  async _loadSamples() {
    if (!this.ctx) return;
    const base = import.meta.env?.BASE_URL || '/';
    const manifest = {
      pistol: ['pistol-cz-1', 'pistol-cz-2'],
      rifle: ['rifle-mosin-1', 'rifle-mosin-2', 'rifle-sks-1'],
      shotgun: ['shotgun-1'],
    };
    for (const [kind, names] of Object.entries(manifest)) {
      for (const name of names) {
        try {
          const res = await fetch(`${base}audio/${name}.mp3`);
          if (!res.ok) continue;
          const data = await res.arrayBuffer();
          const buffer = await this.ctx.decodeAudioData(data);
          // Trim any codec pre-roll so the transient lands on the scheduled time.
          const channel = buffer.getChannelData(0);
          const limit = Math.min(channel.length, Math.floor(this.ctx.sampleRate * 0.06));
          let offset = 0;
          for (let i = 0; i < limit; i++) {
            if (Math.abs(channel[i]) > 0.02) {
              offset = Math.max(0, i - Math.floor(this.ctx.sampleRate * 0.001));
              break;
            }
          }
          this.shotSamples[kind].push({ buffer, offset: offset / this.ctx.sampleRate });
        } catch {
          // Keep the synthesised shot for this weapon.
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // buffers
  // -------------------------------------------------------------------------

  _makeNoise(kind) {
    const ctx = this.ctx;
    const frames = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < frames; i++) {
        const white = Math.random() * 2 - 1;
        if (kind === 'white') {
          data[i] = white;
        } else if (kind === 'pink') {
          // Paul Kellet's economy pink filter.
          b0 = 0.99765 * b0 + white * 0.099046;
          b1 = 0.963 * b1 + white * 0.2965164;
          b2 = 0.57 * b2 + white * 1.0526913;
          data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
        } else {
          // Brown: integrated noise, used for thumps and dirt.
          b0 = b0 * 0.985 + white * 0.06;
          data[i] = b0 * 2.6;
        }
      }
    }
    this.noise[kind] = buffer;
  }

  /** Open-desert impulse response: a few early returns and a dark diffuse tail. */
  _makeIR(seconds) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.max(128, Math.floor(sr * seconds));
    const buffer = ctx.createBuffer(2, len, sr);
    // Early reflections: ground, wall, distant rock. Slightly different per channel for width.
    const taps = [0.013, 0.027, 0.041, 0.067, 0.098, 0.143];

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      const decay = Math.log(1000) / (seconds * 0.95); // ~-60 dB over the buffer
      let lp1 = 0;
      let lp2 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.exp(-decay * t);
        const white = Math.random() * 2 - 1;
        // Cutoff falls with time: the high end dies first, as it does outdoors.
        const k = 0.28 - 0.22 * clamp(t / seconds, 0, 1);
        lp1 += k * (white - lp1);
        lp2 += k * (lp1 - lp2);
        data[i] = lp2 * env * 1.4;
      }
      for (let k = 0; k < taps.length; k++) {
        const idx = Math.floor((taps[k] + (ch ? 0.0021 : 0)) * sr);
        if (idx >= len) continue;
        const g = 0.5 * Math.pow(0.62, k);
        // A short band-limited burst, not a single click.
        for (let s = 0; s < 18; s++) {
          if (idx + s >= len) break;
          data[idx + s] += (Math.random() * 2 - 1) * g * (1 - s / 18);
        }
      }
    }

    // Normalise so the wet bus sits predictably under the dry signal.
    let peak = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    const norm = peak > 0 ? 0.32 / peak : 1;
    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] *= norm;
    }
    return buffer;
  }

  /** Four timbre variants per weapon so repeated fire never sounds identical. */
  _makeVariants() {
    for (const [id, base] of Object.entries(SHOTS)) {
      const list = [];
      for (let v = 0; v < 4; v++) {
        const jitter = 1 + (v - 1.5) * 0.045;
        list.push({
          gain: base.gain * (0.94 + v * 0.03),
          transient: { ...base.transient, gain: base.transient.gain * (0.9 + v * 0.045) },
          body: {
            ...base.body,
            lp: base.body.lp * jitter,
            lpEnd: base.body.lpEnd * jitter,
            dur: base.body.dur * (0.92 + v * 0.05),
          },
          crack: {
            ...base.crack,
            freq: base.crack.freq * jitter,
            freqEnd: base.crack.freqEnd * jitter,
            q: base.crack.q * (0.92 + v * 0.05),
          },
          sub: { ...base.sub, from: base.sub.from * jitter, dur: base.sub.dur * (0.94 + v * 0.04) },
          mech: { ...base.mech, delay: base.mech.delay * (0.85 + v * 0.1) },
          tail: base.tail * (0.9 + v * 0.07),
          distant: base.distant,
        });
      }
      this.variants[id] = list;
    }
  }

  _noiseSource(kind = 'white') {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise[kind];
    src.loop = true;
    src.loopStart = 0;
    return src;
  }

  /** Start the noise buffer at a random offset so consecutive shots are decorrelated. */
  _startNoise(src, when, offsetMax = 1.4) {
    src.start(when, Math.random() * offsetMax);
  }

  _gain(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  _shaper(drive) {
    const shaper = this.ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    return shaper;
  }

  /**
   * Per-shot output bus: dry to the compressor, plus a reverb send scaled by distance and
   * weapon. Returns the input node the layers should connect to.
   */
  _shotBus(when, distance, pan, tail) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    const near = 1 / (1 + distance / 14);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -0.95, 0.95);
      out.connect(panner);
      panner.connect(this.dryBus);
      if (QUALITY[this.quality].reverb && tail > 0) {
        const send = ctx.createGain();
        send.gain.value = tail * (0.45 + 0.55 * near);
        panner.connect(send);
        send.connect(this.convolver);
      }
    } else {
      out.connect(this.dryBus);
    }
    // Air absorption: distant shots lose their click and top end.
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = clamp(16000 / (1 + distance / 9), 900, 16000);
    air.Q.value = 0.6;
    air.connect(out);
    out.gain.value = near;
    return air;
  }

  // -------------------------------------------------------------------------
  // gunshots
  // -------------------------------------------------------------------------

  /**
   * @param {string} kind weapon id (`rifle`, `pistol`, `shotgun`)
   * @param {number} distance metres from the listener
   * @param {number} pan stereo position, -1 left .. 1 right
   */
  shot(kind = 'pistol', distance = 0, pan = 0) {
    if (!this.available || this.muted) return;
    const samples = this.shotSamples[kind];
    if (samples && samples.length) {
      this._sampleShot(kind, samples, distance, pan);
      return;
    }
    const variants = this.variants[kind];
    if (!variants) return;
    const index = this._shotIndex[kind] || 0;
    this._shotIndex[kind] = (index + 1) % variants.length;
    const v = variants[index];
    const near = 1 / (1 + distance / 14);

    // Sound takes time to cross the camp.
    const when = this.ctx.currentTime + Math.min(0.4, distance / SPEED_OF_SOUND);
    const bus = this._shotBus(when, distance, pan, v.tail);
    const close = distance < 18;

    // Layer gains fall off differently: the low body survives distance, the click does not.
    const clickGain = v.transient.gain * near * near;
    const crackGain = v.crack.gain * near;
    const bodyGain = v.body.gain * (0.5 + 0.5 * near);
    const subGain = v.sub.gain * (0.55 + 0.45 * near);

    if (clickGain > 0.01) this._transient(bus, when, v, clickGain);
    this._crack(bus, when, v, crackGain);
    this._body(bus, when, v, bodyGain);
    this._slap(bus, when, v, bodyGain);
    this._sub(bus, when, v, subGain);
    if (QUALITY[this.quality].layers && close) this._mechanical(bus, when, v, near);

    // Far shots get an extra rolling report instead of the mechanical detail.
    if (!close) this._distantBoom(bus, when, v, distance, near);
  }

  /**
   * Recorded close layer + synthesised weight. The sample carries the transient, body and its own
   * room; only the sub is added underneath, and a rolling boom once the shot is far away.
   */
  _sampleShot(kind, samples, distance, pan) {
    const index = this._sampleIndex[kind] || 0;
    this._sampleIndex[kind] = (index + 1) % samples.length;
    const sample = samples[index];
    const buffer = sample.buffer;
    const near = 1 / (1 + distance / 14);
    const when = this.ctx.currentTime + Math.min(0.4, distance / SPEED_OF_SOUND) + 0.002;
    const bus = this._shotBus(when, distance, pan, 0.12);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.97 + Math.random() * 0.06;
    const g = this.ctx.createGain();
    const level = kind === 'shotgun' ? 1.0 : kind === 'rifle' ? 0.95 : 0.52;
    g.gain.value = level * (0.94 + Math.random() * 0.12);
    src.connect(g).connect(bus);
    src.start(when, sample.offset || 0);

    const base = SHOTS[kind];
    if (base && distance < 32) {
      this._sub(bus, when, { sub: { ...base.sub, gain: base.sub.gain * 0.26 } }, near);
    }
    if (distance >= 18) {
      this._distantBoom(bus, when, { distant: base?.distant ?? 0.6 }, distance, near);
    }
  }

  _transient(bus, when, v, gainScale) {
    const src = this._noiseSource('white');
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = v.transient.hp;
    const g = this._gain(when, v.transient.gain * gainScale, 0.0006, v.transient.dur);
    src.connect(hp).connect(g).connect(bus);
    this._startNoise(src, when, 0.4);
    src.stop(when + v.transient.dur + 0.05);
  }

  _crack(bus, when, v, gainScale) {
    const c = v.crack;
    const src = this._noiseSource('white');
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(c.freq, when);
    bp.frequency.exponentialRampToValueAtTime(Math.max(120, c.freqEnd), when + c.dur);
    bp.Q.value = c.q;
    const g = this._gain(when, c.gain * gainScale, 0.0008, c.dur);
    src.connect(bp).connect(g).connect(bus);
    this._startNoise(src, when, 1.2);
    src.stop(when + c.dur + 0.05);
  }

  _body(bus, when, v, gainScale) {
    const b = v.body;
    const src = this._noiseSource('pink');
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(b.lp, when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(80, b.lpEnd), when + b.dur);
    lp.Q.value = 0.7;
    const shaper = this._shaper(b.drive);
    const g = this._gain(when, b.gain * gainScale, 0.0015, b.dur);
    src.connect(lp).connect(shaper).connect(g).connect(bus);
    this._startNoise(src, when, 1.5);
    src.stop(when + b.dur + 0.08);
  }

  /** The ground/terrain return: a delayed, darker copy of the body. Big realism cue. */
  _slap(bus, when, v, gainScale) {
    const t = when + 0.014 + Math.random() * 0.012;
    const src = this._noiseSource('pink');
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650 + Math.random() * 450;
    lp.Q.value = 0.6;
    const g = this._gain(t, v.body.gain * gainScale * 0.34, 0.004, 0.17);
    src.connect(lp).connect(g).connect(bus);
    this._startNoise(src, t, 1.2);
    src.stop(t + 0.22);
  }

  _sub(bus, when, v, gainScale) {
    const s = v.sub;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(s.from, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(18, s.to), when + s.dur);
    const g = this._gain(when, s.gain * gainScale, 0.004, s.dur);
    osc.connect(g).connect(bus);
    osc.start(when);
    osc.stop(when + s.dur + 0.05);
  }

  _mechanical(bus, when, v, near) {
    const m = v.mech;
    const t = when + m.delay;
    // Bolt/action: a short metallic resonance plus a dry click.
    for (let p = 0; p < 2; p++) {
      const osc = this.ctx.createOscillator();
      osc.type = p ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(m.freq * (p ? 1.34 : 1), t);
      const g = this._gain(t, m.gain * near * (p ? 0.5 : 0.7), 0.001, m.dur);
      osc.connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + m.dur + 0.04);
    }
    const src = this._noiseSource('white');
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 2.4;
    const g = this._gain(t, m.gain * 0.5 * near, 0.0006, 0.028);
    src.connect(bp).connect(g).connect(bus);
    this._startNoise(src, t, 0.3);
    src.stop(t + 0.06);
  }

  _distantBoom(bus, when, v, distance, near) {
    const src = this._noiseSource('brown');
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = clamp(1500 / (1 + distance / 30), 180, 1500);
    const g = this._gain(when, v.distant * near * 1.4, 0.02, 0.55);
    src.connect(lp).connect(g).connect(bus);
    this._startNoise(src, when, 1);
    src.stop(when + 0.7);
  }

  // -------------------------------------------------------------------------
  // world sounds
  // -------------------------------------------------------------------------

  /** Bullet impact. `surface` matches the FX presets. */
  impact(surface = 'sand', distance = 0, pan = 0) {
    if (!this.available || this.muted) return;
    const p = IMPACTS[surface] || IMPACTS.sand;
    if (distance > 24) return;
    const when = this.ctx.currentTime + Math.min(0.2, distance / SPEED_OF_SOUND);
    const bus = this._shotBus(when, distance, pan, 0.08);

    const src = this._noiseSource('white');
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = p.clickHp;
    const click = this._gain(when, p.click, 0.0005, 0.022);
    src.connect(hp).connect(click).connect(bus);
    this._startNoise(src, when, 1.5);
    src.stop(when + 0.06);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(p.body, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, p.body * 0.45), when + p.bodyDur);
    const body = this._gain(when, p.bodyGain, 0.0015, p.bodyDur);
    osc.connect(body).connect(bus);
    osc.start(when);
    osc.stop(when + p.bodyDur + 0.04);

    const tex = this._noiseSource(p.tex);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.texLp;
    const tg = this._gain(when, p.texGain, 0.002, p.texDur);
    tex.connect(lp).connect(tg).connect(bus);
    this._startNoise(tex, when, 1.2);
    tex.stop(when + p.texDur + 0.05);

    if (p.ring) {
      for (const freq of p.ring) {
        const ring = this.ctx.createOscillator();
        ring.type = 'triangle';
        ring.frequency.value = freq * (0.97 + Math.random() * 0.06);
        const rg = this._gain(when, 0.1, 0.001, 0.16);
        ring.connect(rg).connect(bus);
        ring.start(when);
        ring.stop(when + 0.2);
      }
    }
    for (let i = 0; i < p.debris; i++) {
      const t = when + 0.03 + Math.random() * 0.16;
      const chip = this.ctx.createOscillator();
      chip.type = 'triangle';
      chip.frequency.value = 1400 + Math.random() * 2600;
      const cg = this._gain(t, 0.035, 0.0005, 0.03);
      chip.connect(cg).connect(bus);
      chip.start(t);
      chip.stop(t + 0.05);
    }
  }

  /** Magazine out, magazine in, bolt. Timed roughly to the reload animation. */
  reload(kind = 'pistol') {
    if (!this.available || this.muted) return;
    const heavy = kind === 'shotgun';
    const t = this.ctx.currentTime + 0.04;
    const bus = this._shotBus(t, 0, 0, 0.05);
    const beats = heavy ? [0, 0.28, 0.62, 1.1] : [0, 0.2, 0.48];
    for (let i = 0; i < beats.length; i++) {
      this._mechClick(bus, t + beats[i], heavy ? 0.16 : 0.12, i === beats.length - 1 ? 0.22 : 0.13);
    }
  }

  _mechClick(bus, t, gain, dur) {
    const src = this._noiseSource('white');
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 1200;
    bp.Q.value = 3.5;
    const g = this._gain(t, gain, 0.0006, dur);
    src.connect(bp).connect(g).connect(bus);
    this._startNoise(src, t, 1);
    src.stop(t + dur + 0.05);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 260 + Math.random() * 120;
    const og = this._gain(t, gain * 0.6, 0.001, dur * 0.7);
    osc.connect(og).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.04);
  }

  /** Trigger on an empty chamber. */
  dry() {
    if (!this.available || this.muted) return;
    const bus = this._shotBus(this.ctx.currentTime, 0, 0, 0.02);
    this._mechClick(bus, this.ctx.currentTime, 0.1, 0.05);
  }

  /** Brass hitting the ground; only the player's own casings call this. */
  casing() {
    if (!this.available || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    const f = 1500 + Math.random() * 900;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.06);
    const g = this._gain(t, 0.03, 0.0005, 0.07);
    osc.connect(g).connect(this.dryBus);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  /** Boot in sand. `pan`/`distance` default to the player. */
  step(pan = 0) {
    if (!this.available || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSource('brown');
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700 + Math.random() * 500;
    const g = this._gain(t, 0.11, 0.004, 0.09);
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    src.connect(lp).connect(g);
    if (panner) {
      panner.pan.value = clamp(pan, -0.9, 0.9);
      g.connect(panner).connect(this.dryBus);
    } else {
      g.connect(this.dryBus);
    }
    const offset = 0.2 + Math.random() * 1.4;
    src.start(t, offset);
    src.stop(t + 0.14);
    this._stepIndex++;
  }

  /** Low desert wind bed. A looped pink-noise source with slow filter and gain drift. */
  _startWind() {
    if (!this.ctx || this._wind) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise.pink;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.028;
    src.connect(lp).connect(g).connect(this.master);
    src.start(ctx.currentTime, Math.random() * 1.5);

    // Two slow LFOs so the wind breathes instead of sounding like a hiss loop.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.061;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.011;
    lfo.connect(lfoGain).connect(g.gain);

    const lfo2 = ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = 0.037;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 150;
    lfo2.connect(lfo2Gain).connect(lp.frequency);

    lfo.start();
    lfo2.start();
    this._wind = { src, lfo, lfo2, gain: g };
  }

  _stopWind() {
    if (!this._wind) return;
    try {
      this._wind.src.stop();
      this._wind.lfo.stop();
      this._wind.lfo2.stop();
    } catch {
      /* already stopped */
    }
    this._wind = null;
  }
}
