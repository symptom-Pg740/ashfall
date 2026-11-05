/**
 * Quality selection and application.
 *
 * Presentation-only: picks a quality tier from the URL, localStorage or device hints and applies it
 * to the renderer, atmosphere, particles, fog, enemies and audio. No gameplay rules live here.
 *
 * `shadowsOn` is kept in this closure because `applyShadowState` owns the toggle; the composition
 * root reads it through the getter for the auto-fallback check and the boot-time UI state.
 */
import { QUALITY } from '../perf.js';

export function createQualityController({
  atmosphere,
  scene,
  particles,
  wasteland,
  enemies,
  fx,
  audio,
  ui,
  perf,
}) {
  let shadowsOn = true;

  function applyShadowState(enabled, size) {
    const changed = enabled !== shadowsOn;
    shadowsOn = enabled;
    atmosphere.setShadowQuality(enabled, size);
    if (changed) {
      // Shadow defines are baked into compiled programs; refresh once on toggle.
      scene.traverse((obj) => {
        const material = obj.material;
        if (!material) return;
        const materials = Array.isArray(material) ? material : [material];
        for (const m of materials) m.needsUpdate = true;
      });
    }
  }

  function applyQuality(name, silent = false) {
    if (!QUALITY[name]) return;
    perf.setQuality(name);
    const q = QUALITY[name];
    if (wasteland.setGrassQuality) wasteland.setGrassQuality(q.grass);
    particles.setEmberCount(q.embers);
    scene.fog.density = ui.toggleState.fog ? q.fogDensity : 0.0001;
    enemies.maxActive = q.enemies;
    applyShadowState(q.shadows, q.shadowSize);
    fx.setQuality(name);
    audio.setQuality(name);
    ui.setQuality(name);
    ui.setToggle('adaptive', perf.adaptive);
    ui.setToggle('shadows', q.shadows);
    if (!silent) {
      ui.toast(`QUALITY · ${name.toUpperCase()}`);
      try {
        localStorage.setItem('ashfall-quality', name);
      } catch {
        /* ignore */
      }
    }
  }

  function pickQuality(coarse) {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('quality');
    if (QUALITY[forced]) return forced;
    try {
      const saved = localStorage.getItem('ashfall-quality');
      if (QUALITY[saved]) return saved;
    } catch {
      /* ignore */
    }
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    if (coarse && (memory <= 3 || cores <= 4)) return 'low';
    if (coarse) return 'balanced';
    if (memory >= 8 && cores >= 8) return 'high';
    return 'balanced';
  }

  return {
    pickQuality,
    applyQuality,
    applyShadowState,
    get shadowsOn() {
      return shadowsOn;
    },
  };
}
