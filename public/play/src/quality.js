// One source of truth for how expensive the city is allowed to be.
//
// Every system that can cost frame time reads its budget from here instead of
// re-deriving "is this a weak device" from navigator flags. A tier is picked
// once from the device, then raised or lowered at runtime from measured
// HEADROOM (JS busy fraction and rAF interval against the display's own
// refresh interval), so a laptop that thermal-throttles mid-session degrades
// gracefully, and a 4-core laptop that lands on 'low' is allowed to climb.
//
// Fields other systems read (World/Traffic/Citizens/Crowd via setDetail):
//   crowd, crowdRadius, traffic, citizens, suburbs, trees, plazaLights,
//   vendors, detailProps, bubbleRadius, buildRadius, disposeRadius
// Fields the renderer reads: pixelRatio (a CAP, the dynamic render scale
// multiplies it), shadows, cascades, shadowRadius, postfx, bloom, bloomScale,
// aa ('msaa' | 'fxaa' | 'none'), rtSamples, grain, outline, dof, fog, far,
// vertexAO, wetStreets, rimLight, clouds, motes.

export const TIER_ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];

const TIERS = {
  potato: {
    pixelRatio: 1.0, shadows: 0, cascades: 0, shadowRadius: 1, postfx: false, bloom: false,
    aa: 'msaa', rtSamples: 0, grain: 0, outline: 0, dof: false,
    crowd: 26, crowdRadius: 70, crowdShadows: 0, traffic: 4, citizens: 5,
    suburbs: 56, trees: 90, plazaLights: false, vendors: false,
    buildRadius: 62, disposeRadius: 94, fog: 0.0092, far: 620,
    vertexAO: false, wetStreets: false, rimLight: false, clouds: true, motes: false,
    detailProps: false, bubbleRadius: 26,
  },
  low: {
    pixelRatio: 1.25, shadows: 0, cascades: 0, shadowRadius: 1, postfx: true, bloom: true, bloomScale: 0.25,
    aa: 'msaa', rtSamples: 4, grain: 0.008, outline: 0.7, dof: true,
    crowd: 60, crowdRadius: 90, crowdShadows: 0, traffic: 6, citizens: 5,
    suburbs: 56, trees: 90, plazaLights: false, vendors: true,
    buildRadius: 78, disposeRadius: 112, fog: 0.0074, far: 780,
    vertexAO: true, wetStreets: false, rimLight: false, clouds: true, motes: false,
    detailProps: false, bubbleRadius: 30,
  },
  medium: {
    pixelRatio: 1.5, shadows: 1024, cascades: 1, shadowRadius: 1.6, postfx: true, bloom: true, bloomScale: 0.35,
    aa: 'fxaa', rtSamples: 0, grain: 0.011, outline: 0.85, dof: true,
    crowd: 120, crowdRadius: 110, crowdShadows: 0, traffic: 9, citizens: 7,
    suburbs: 88, trees: 160, plazaLights: true, vendors: true,
    buildRadius: 96, disposeRadius: 136, fog: 0.0058, far: 950,
    vertexAO: true, wetStreets: true, rimLight: false, clouds: true, motes: true,
    detailProps: true, bubbleRadius: 34,
  },
  high: {
    pixelRatio: 2.0, shadows: 2048, cascades: 2, shadowRadius: 2.0, postfx: true, bloom: true, bloomScale: 0.5,
    aa: 'fxaa', rtSamples: 0, grain: 0.014, outline: 1, dof: true,
    crowd: 220, crowdRadius: 130, crowdShadows: 24, traffic: 12, citizens: 7,
    suburbs: 88, trees: 160, plazaLights: true, vendors: true,
    buildRadius: 105, disposeRadius: 145, fog: 0.0052, far: 1200,
    vertexAO: true, wetStreets: true, rimLight: false, clouds: true, motes: true,
    detailProps: true, bubbleRadius: 38,
  },
  ultra: {
    pixelRatio: 2.0, shadows: 4096, cascades: 2, shadowRadius: 2.2, postfx: true, bloom: true, bloomScale: 0.5,
    aa: 'fxaa', rtSamples: 0, grain: 0.015, outline: 1, dof: true,
    crowd: 340, crowdRadius: 150, crowdShadows: 40, traffic: 16, citizens: 9,
    suburbs: 88, trees: 160, plazaLights: true, vendors: true,
    buildRadius: 118, disposeRadius: 160, fog: 0.0048, far: 1300,
    vertexAO: true, wetStreets: true, rimLight: false, clouds: true, motes: true,
    detailProps: true, bubbleRadius: 42,
  },
};

// Phones: same ladder, tighter budgets. Coarse pointer + small screen picks
// these overrides on top of the tier (no MSAA when post is on, 512 shadows on
// medium, a pixel-ratio cap that keeps fill rate sane on 3x displays).
const MOBILE = {
  low: { pixelRatio: 1.1, crowd: 48, outline: 0.6 },
  medium: {
    shadows: 512, cascades: 1, shadowRadius: 1.2, aa: 'fxaa', rtSamples: 0, pixelRatio: 1.25,
    crowd: 90, crowdRadius: 90, buildRadius: 80, disposeRadius: 116, outline: 0.7, grain: 0.008,
    citizens: 5, traffic: 6,
  },
  high: { shadows: 1024, cascades: 1, pixelRatio: 1.5, crowd: 140, crowdRadius: 110, grain: 0.011, citizens: 7 },
  ultra: { shadows: 2048, cascades: 1, pixelRatio: 1.75, crowd: 200, grain: 0.012 },
};

// Weak-integrated-GPU strings that consistently miss 60fps with a post stack.
const WEAK_GPU = /(mali-[tg]?[0-6]|adreno \(tm\) [1-5]\d\d|powervr|intel.*(hd graphics [2-5]|uhd graphics 6[01]0)|llvmpipe|swiftshader|software)/i;

// The GPU string is read from a throwaway context so the tier is known BEFORE
// the real renderer is created (its antialias flag depends on the tier).
let _gpu = null;
export function gpuName(renderer = null) {
  if (_gpu !== null && !renderer) return _gpu;
  try {
    let gl;
    if (renderer) gl = renderer.getContext();
    else {
      const c = document.createElement('canvas');
      gl = c.getContext('webgl2') || c.getContext('webgl');
    }
    if (!gl) return (_gpu = '');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    _gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    if (!renderer) gl.getExtension('WEBGL_lose_context')?.loseContext();
    return _gpu;
  } catch { return (_gpu = ''); }
}

export function isCompactTouch() {
  return !!(window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 800);
}

export function detectTier() {
  const nav = navigator;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const smallScreen = Math.min(screen.width, screen.height) < 800;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4;
  const gpu = gpuName();

  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return 'potato';
  if (WEAK_GPU.test(gpu)) return coarse ? 'potato' : 'low';
  if (cores <= 4 || mem <= 3) return 'low';
  if (coarse && smallScreen) return 'medium';
  if (mem <= 4) return 'medium';
  if (cores >= 8 && mem >= 8) return 'high';
  return 'medium';
}

// Common refresh intervals (ms); the measured median snaps to the nearest.
const REFRESH = [1000 / 144, 1000 / 120, 1000 / 90, 1000 / 75, 1000 / 60, 1000 / 50, 1000 / 40, 1000 / 30];
const MIN_RENDER_SCALE = 0.62;

export class Quality {
  // onChange(settings, tier, reason) fires whenever the budget actually moves.
  // onScale(renderScale) fires when the dynamic resolution moves.
  constructor(rendererOrOpts = null, opts = {}) {
    if (rendererOrOpts && !rendererOrOpts.isWebGLRenderer) { opts = rendererOrOpts; rendererOrOpts = null; }
    this.onChange = opts.onChange || null;
    this.onScale = opts.onScale || null;
    this.mobile = isCompactTouch();
    this.detected = detectTier();
    let saved = null;
    try { saved = localStorage.getItem('em_quality'); } catch {}
    this.manual = TIER_ORDER.includes(saved) ? saved : null;
    this.tier = this.manual || this.detected;
    this.gpu = gpuName();
    this._cache = new Map();

    // controller state
    this.displayMs = 1000 / 60;
    this.samples = [];
    this.busyEMA = 0.5;
    this.pressureEMA = 0.5;
    this.frameEMA = 16.7;          // kept for the debug HUD
    this.renderScale = 1;
    this.cooldown = 4;             // let the first districts stream in before judging
    this.goodTime = 0;
    this.badTime = 0;
    this.scaleCooldown = 0;
    this.ignoreUntil = 0;
    document.addEventListener('visibilitychange', () => {
      this.ignoreUntil = performance.now() + 2000;
      this.samples.length = 0;
    });
  }

  get s() {
    const key = this.tier + (this.mobile ? ':m' : '');
    let s = this._cache.get(key);
    if (!s) {
      s = { ...TIERS[this.tier], ...(this.mobile ? MOBILE[this.tier] || {} : {}), tier: this.tier, mobile: this.mobile };
      this._cache.set(key, s);
    }
    return s;
  }
  get index() { return TIER_ORDER.indexOf(this.tier); }

  // Player-chosen tier sticks until they clear it; auto-adapt stops entirely so
  // we never fight someone who deliberately asked for ultra on a weak laptop.
  setManual(tier) {
    if (tier && !TIER_ORDER.includes(tier)) return;
    this.manual = tier || null;
    try {
      if (tier) localStorage.setItem('em_quality', tier);
      else localStorage.removeItem('em_quality');
    } catch {}
    this._apply(tier || this.detected, 'manual');
  }

  _apply(tier, reason) {
    if (tier === this.tier) return false;
    this.tier = tier;
    this.cooldown = 4;
    this.goodTime = 0;
    this.badTime = 0;
    this.onChange?.(this.s, tier, reason);
    return true;
  }

  _setScale(v) {
    v = Math.min(1, Math.max(MIN_RENDER_SCALE, Math.round(v * 100) / 100));
    if (v === this.renderScale) return;
    this.renderScale = v;
    this.onScale?.(v);
  }

  // Called once per rendered frame: the rAF interval and how many of those
  // milliseconds the main thread spent in sim + render JS.
  update(frameMs, busyMs = 0) {
    frameMs = Math.min(frameMs, 250);
    this.frameEMA = this.frameEMA * 0.94 + frameMs * 0.06;
    const now = performance.now();
    if (now < this.ignoreUntil) return;

    // display interval: median of recent near-idle frames, snapped to a real refresh
    if (busyMs < frameMs * 0.6 && frameMs > 3) {
      this.samples.push(frameMs);
      if (this.samples.length > 90) this.samples.shift();
      if (this.samples.length >= 24 && (this.samples.length % 12 === 0)) {
        const sorted = [...this.samples].sort((a, b) => a - b);
        const med = sorted[sorted.length >> 1];
        let best = REFRESH[0];
        for (const r of REFRESH) if (Math.abs(r - med) < Math.abs(best - med)) best = r;
        this.displayMs = best;
      }
    }

    const dt = frameMs / 1000;
    const busy = busyMs / Math.max(frameMs, this.displayMs);
    // slowness: 0 at vsync, 1 when a frame takes 1.7x the display interval
    const slow = Math.min(1, Math.max(0, (frameMs - this.displayMs * 1.1) / (this.displayMs * 0.6)));
    const pressure = Math.max(busy, slow);
    this.busyEMA = this.busyEMA * 0.9 + busy * 0.1;
    this.pressureEMA = this.pressureEMA * 0.9 + pressure * 0.1;

    // inner loop: render scale answers short spikes within a tier
    this.scaleCooldown -= dt;
    if (this.scaleCooldown <= 0) {
      if (this.pressureEMA > 0.9 && this.renderScale > MIN_RENDER_SCALE + 0.001) {
        this._setScale(this.renderScale - 0.08);
        this.scaleCooldown = 1.5;
      } else if (this.pressureEMA < 0.6 && this.renderScale < 1) {
        this._setScale(this.renderScale + 0.08);
        this.scaleCooldown = 1.5;
      }
    }

    if (this.manual) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    // outer loop: drop after 3 s of >90% pressure at minimum scale, climb after
    // 10 s of <55% pressure at full scale
    if (this.pressureEMA > 0.9) {
      this.badTime += dt; this.goodTime = 0;
      if (this.badTime > 3 && this.renderScale <= MIN_RENDER_SCALE + 0.001 && this.index > 0) {
        this._apply(TIER_ORDER[this.index - 1], `pressure ${(this.pressureEMA * 100) | 0}% @ ${this.frameEMA.toFixed(1)}ms`);
        this._setScale(0.9);
      }
    } else if (this.pressureEMA < 0.55 && this.renderScale >= 1) {
      this.goodTime += dt; this.badTime = 0;
      if (this.goodTime > 10 && this.index < TIER_ORDER.length - 1) {
        this._apply(TIER_ORDER[this.index + 1], `headroom ${(100 - this.pressureEMA * 100) | 0}%`);
      }
    } else {
      this.goodTime = Math.max(0, this.goodTime - dt * 2);
      this.badTime = Math.max(0, this.badTime - dt);
    }
  }
}
