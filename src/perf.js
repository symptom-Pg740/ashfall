export const QUALITY = {
  low: {
    dprCap: 1.1,
    baseScale: 0.62,
    grass: 220,
    enemies: 10,
    embers: 150,
    fogDensity: 0.012,
    shadows: false,
    shadowSize: 512,
  },
  balanced: {
    dprCap: 1.6,
    baseScale: 0.8,
    grass: 520,
    enemies: 20,
    embers: 340,
    fogDensity: 0.009,
    shadows: true,
    shadowSize: 1024,
  },
  high: {
    dprCap: 2.0,
    baseScale: 1.0,
    grass: 850,
    enemies: 28,
    embers: 420,
    fogDensity: 0.009,
    shadows: true,
    shadowSize: 2048,
  },
};

export class Perf {
  constructor(renderer) {
    this.renderer = renderer;
    this.quality = 'balanced';
    this.dprCap = QUALITY.balanced.dprCap;
    this.scale = QUALITY.balanced.baseScale;
    this.minScale = 0.5;
    this.maxScale = 1.0;
    this.adaptive = true;
    this.frames = [];
    this.history = [];
    this.windowMs = 0;
    this.windowFrames = 0;
    this.lastStatsAt = 0;
    this.adaptAt = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.stats = {
      fps: 0,
      ms: 0,
      min: 0,
      calls: 0,
      tris: 0,
      scale: this.scale,
      dpr: 1,
      gpu: this.readGpu(),
      heap: 0,
      activeGhouls: 0,
    };
    this.resize();
  }

  readGpu() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL';
      let s = String(name);
      if (s.startsWith('ANGLE (')) s = s.slice(7).replace(/\)$/, '');
      return s.slice(0, 46);
    } catch {
      return 'WebGL';
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.stats.dpr = dpr;
    this.stats.scale = this.scale;
  }

  setQuality(name) {
    const q = QUALITY[name];
    if (!q) return;
    this.quality = name;
    this.dprCap = q.dprCap;
    this.scale = q.baseScale;
    this.adaptive = name !== 'high';
    this.resize();
  }

  setAdaptive(on) {
    this.adaptive = on;
  }

  frame(dtMs) {
    if (dtMs <= 0 || dtMs > 300) return;

    this.windowMs += dtMs;
    this.windowFrames++;
    this.frames.push(dtMs);
    if (this.frames.length > 160) this.frames.shift();

    if (this.windowMs >= 500) {
      const avgMs = this.windowMs / this.windowFrames;
      const fps = 1000 / avgMs;
      const sorted = this.frames.slice().sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] || avgMs;
      this.stats.fps = Math.round(fps);
      this.stats.ms = avgMs.toFixed(1);
      this.stats.min = Math.round(1000 / p95);
      this.stats.calls = this.renderer.info.render.calls;
      this.stats.tris = this.renderer.info.render.triangles;
      this.stats.scale = this.scale;
      this.stats.dpr = this.renderer.getPixelRatio();
      this.stats.heap = performance.memory
        ? Math.round(performance.memory.usedJSHeapSize / 1048576)
        : 0;
      this.history.push(fps);
      if (this.history.length > 90) this.history.shift();

      if (this.adaptive) {
        const now = performance.now();
        if (avgMs > 19.5) {
          this.slowWindows++;
          this.fastWindows = 0;
        } else if (avgMs < 13.2) {
          this.fastWindows++;
          this.slowWindows = 0;
        } else {
          this.slowWindows = 0;
          this.fastWindows = 0;
        }

        if (now > this.adaptAt && this.slowWindows >= 2 && this.scale > this.minScale) {
          this.scale = Math.max(this.minScale, this.scale - 0.09);
          this.resize();
          this.adaptAt = now + 1600;
          this.slowWindows = 0;
        } else if (now > this.adaptAt && this.fastWindows >= 5 && this.scale < this.maxScale) {
          this.scale = Math.min(this.maxScale, this.scale + 0.05);
          this.resize();
          this.adaptAt = now + 2200;
          this.fastWindows = 0;
        }
      }

      this.windowMs = 0;
      this.windowFrames = 0;
    }
  }
}
