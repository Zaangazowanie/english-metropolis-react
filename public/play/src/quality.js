// One source of truth for how expensive the city is allowed to be.
//
// Every system that can cost frame time reads its budget from here instead of
// re-deriving "is this a weak device" from navigator flags. A tier is picked
// once from the device, then raised or lowered at runtime from measured frame
// time, so a laptop that thermal-throttles mid-session degrades gracefully
// instead of stuttering until the player leaves.

export const TIER_ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];

// pixelRatio is a CAP, not a target — the renderer still multiplies by the
// dynamic render scale. Crowd counts are per-visible-district totals.
const TIERS = {
  potato: {
    pixelRatio: 1.0, shadows: 0, postfx: false, bloom: false, aa: 'none',
    crowd: 26, crowdRadius: 70, crowdShadows: 0, traffic: 4,
    buildRadius: 62, disposeRadius: 94, fog: 0.0092, far: 620,
    vertexAO: false, wetStreets: false, rimLight: false, clouds: false, motes: false,
    detailProps: false, bubbleRadius: 26,
  },
  low: {
    pixelRatio: 1.25, shadows: 0, postfx: true, bloom: true, bloomScale: 0.25, aa: 'none',
    crowd: 60, crowdRadius: 90, crowdShadows: 0, traffic: 6,
    buildRadius: 78, disposeRadius: 112, fog: 0.0074, far: 780,
    vertexAO: true, wetStreets: false, rimLight: true, clouds: true, motes: false,
    detailProps: false, bubbleRadius: 30,
  },
  medium: {
    pixelRatio: 1.5, shadows: 1024, postfx: true, bloom: true, bloomScale: 0.35, aa: 'fxaa',
    crowd: 120, crowdRadius: 110, crowdShadows: 0, traffic: 9,
    buildRadius: 96, disposeRadius: 136, fog: 0.0058, far: 950,
    vertexAO: true, wetStreets: true, rimLight: true, clouds: true, motes: true,
    detailProps: true, bubbleRadius: 34,
  },
  high: {
    pixelRatio: 2.0, shadows: 2048, postfx: true, bloom: true, bloomScale: 0.5, aa: 'fxaa',
    crowd: 220, crowdRadius: 130, crowdShadows: 24, traffic: 12,
    buildRadius: 105, disposeRadius: 145, fog: 0.0052, far: 1200,
    vertexAO: true, wetStreets: true, rimLight: true, clouds: true, motes: true,
    detailProps: true, bubbleRadius: 38,
  },
  ultra: {
    pixelRatio: 2.0, shadows: 4096, postfx: true, bloom: true, bloomScale: 0.5, aa: 'fxaa',
    crowd: 340, crowdRadius: 150, crowdShadows: 40, traffic: 16,
    buildRadius: 118, disposeRadius: 160, fog: 0.0048, far: 1300,
    vertexAO: true, wetStreets: true, rimLight: true, clouds: true, motes: true,
    detailProps: true, bubbleRadius: 42,
  },
};

// Weak-integrated-GPU strings that consistently miss 60fps with a post stack.
const WEAK_GPU = /(mali-[tg]?[0-6]|adreno \(tm\) [1-5]\d\d|powervr|intel.*(hd graphics [2-5]|uhd graphics 6[01]0)|llvmpipe|swiftshader|software)/i;

function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return '';
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch { return ''; }
}

export function detectTier(renderer) {
  const nav = navigator;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const smallScreen = Math.min(screen.width, screen.height) < 800;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const gpu = gpuName(renderer);

  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return 'potato';
  if (WEAK_GPU.test(gpu)) return coarse ? 'potato' : 'low';
  if (cores <= 4 || mem <= 3) return coarse ? 'low' : 'low';
  if (coarse && smallScreen) return 'medium';
  if (cores >= 8 && mem >= 8) return coarse ? 'high' : 'high';
  return 'medium';
}

export class Quality {
  // onChange(settings, tier, reason) fires whenever the budget actually moves.
  constructor(renderer, { onChange = null } = {}) {
    this.onChange = onChange;
    this.detected = detectTier(renderer);
    const saved = localStorage.getItem('em_quality');
    this.manual = TIER_ORDER.includes(saved) ? saved : null;
    this.tier = this.manual || this.detected;
    this.gpu = gpuName(renderer);
    this.frameEMA = 16.7;
    this.cooldown = 4;            // let the first districts stream in before judging
    this.goodStreak = 0;
  }

  get s() { return TIERS[this.tier]; }
  get index() { return TIER_ORDER.indexOf(this.tier); }

  // Player-chosen tier sticks until they clear it; auto-adapt stops entirely so
  // we never fight someone who deliberately asked for ultra on a weak laptop.
  setManual(tier) {
    if (tier && !TIER_ORDER.includes(tier)) return;
    this.manual = tier || null;
    if (tier) localStorage.setItem('em_quality', tier);
    else localStorage.removeItem('em_quality');
    this._apply(tier || this.detected, 'manual');
  }

  _apply(tier, reason) {
    if (tier === this.tier) return false;
    this.tier = tier;
    this.cooldown = 4;
    this.onChange?.(this.s, tier, reason);
    return true;
  }

  // Called once per rendered frame with that frame's duration in ms.
  update(frameMs, dt) {
    this.frameEMA = this.frameEMA * 0.94 + Math.min(frameMs, 120) * 0.06;
    if (this.manual) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    // Drop fast (one bad stretch is enough), climb slowly (needs a sustained
    // margin) — otherwise the tier oscillates around the 60fps boundary.
    if (this.frameEMA > 26 && this.index > 0) {
      this._apply(TIER_ORDER[this.index - 1], `frame ${this.frameEMA.toFixed(1)}ms`);
      this.goodStreak = 0;
    } else if (this.frameEMA < 12.5 && this.index < TIER_ORDER.length - 1) {
      this.goodStreak += 1;
      if (this.goodStreak >= 3) {
        this.goodStreak = 0;
        this._apply(TIER_ORDER[this.index + 1], `frame ${this.frameEMA.toFixed(1)}ms`);
      } else {
        this.cooldown = 3;
      }
    } else {
      this.goodStreak = 0;
      this.cooldown = 2;
    }
  }
}
