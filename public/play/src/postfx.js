// Screen-space finish for the city: dual-filter bloom, ACES tone mapping, a
// filmic grade keyed to the time of day, a depth-edge ink outline, vignette,
// grain and FXAA — folded into ONE composite pass so the whole stack costs a
// handful of fullscreen draws.
//
// Why it is built this way rather than with EffectComposer: the scene renders
// into a half-float target with tone mapping OFF, so neon can legitimately
// exceed 1.0 and the bloom threshold has something real to find. Tone mapping,
// colour grading and the sRGB encode all happen once, in the composite, instead
// of being smeared across passes. On the weakest tier the whole file is bypassed
// and the renderer draws straight to the canvas exactly as it used to.
//
// Order inside the composite matters and was wrong before (FXAA ran last and
// mixed 85% of an un-bloomed, un-graded resample back in, which left bloom,
// vignette and grain at ~15% on every post tier): now FXAA resolves the LINEAR
// scene first, then bloom, exposure, ACES, grade, outline, vignette, grain.
import * as THREE from 'three';

const QUAD = new THREE.BufferGeometry();
QUAD.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
QUAD.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// 13-tap Jimenez-style downsample: stable under motion, no fireflies crawling
// along the neon signage when the camera moves.
const DOWN_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uThreshold;   // <0 means "no prefilter, just downsample"
  uniform float uKnee;
  varying vec2 vUv;

  vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }

  void main() {
    vec3 a = tap(vec2(-2.0,  2.0)), b = tap(vec2(0.0,  2.0)), c = tap(vec2(2.0,  2.0));
    vec3 d = tap(vec2(-2.0,  0.0)), e = tap(vec2(0.0,  0.0)), f = tap(vec2(2.0,  0.0));
    vec3 g = tap(vec2(-2.0, -2.0)), h = tap(vec2(0.0, -2.0)), i = tap(vec2(2.0, -2.0));
    vec3 j = tap(vec2(-1.0,  1.0)), k = tap(vec2(1.0,  1.0));
    vec3 l = tap(vec2(-1.0, -1.0)), m = tap(vec2(1.0, -1.0));

    vec3 col = e * 0.125;
    col += (a + c + g + i) * 0.03125;
    col += (b + d + f + h) * 0.0625;
    col += (j + k + l + m) * 0.125;

    if (uThreshold >= 0.0) {
      // soft-knee threshold so bright-ish surfaces ramp in instead of popping
      float br = max(col.r, max(col.g, col.b));
      float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
      soft = soft * soft / (4.0 * uKnee + 1e-4);
      col *= max(soft, br - uThreshold) / max(br, 1e-4);
      col = max(col, vec3(0.0));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// 3x3 tent upsample, additively blended onto the next-larger mip
const UP_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uRadius;
  varying vec2 vUv;

  void main() {
    vec2 o = uTexel * uRadius;
    vec3 col = texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb * 1.0;
    col += texture2D(tSrc, vUv + vec2(0.0,   o.y)).rgb * 2.0;
    col += texture2D(tSrc, vUv + vec2(o.x,   o.y)).rgb * 1.0;
    col += texture2D(tSrc, vUv + vec2(-o.x,  0.0)).rgb * 2.0;
    col += texture2D(tSrc, vUv).rgb                    * 4.0;
    col += texture2D(tSrc, vUv + vec2(o.x,   0.0)).rgb * 2.0;
    col += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 1.0;
    col += texture2D(tSrc, vUv + vec2(0.0,  -o.y)).rgb * 2.0;
    col += texture2D(tSrc, vUv + vec2(o.x,  -o.y)).rgb * 1.0;
    gl_FragColor = vec4(col / 16.0, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tDepth;
  uniform sampler2D tBlur;
  uniform vec2 uTexel;
  uniform vec2 uNearFar;
  uniform float uBloom;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uFrame;
  uniform float uFxaa;
  uniform float uFlash;        // white-out used by the metro travel fade
  uniform float uOutline;      // 0 = off
  uniform float uPixelRatio;
  uniform float uFocus;        // 0..1 overlay-open depth blur + desaturate
  uniform vec3 uInk;           // outline tint (multiplies the local colour)
  uniform vec3 uShadowTint;
  uniform vec3 uHighTint;
  uniform float uSaturation;
  varying vec2 vUv;

  // ACES filmic (Narkowicz fit) — one mad-heavy expression, no LUT texture
  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
               step(vec3(0.0031308), c));
  }

  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  // perceptual luma of a linear sample, for the edge detector
  float plum(vec2 uv) { return sqrt(luma(aces(texture2D(tScene, uv).rgb * uExposure))); }

  float linDepth(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    float zn = d * 2.0 - 1.0;
    return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - zn * (uNearFar.y - uNearFar.x));
  }

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    vec2 fromCentre = uv - 0.5;
    float r2 = dot(fromCentre, fromCentre);

    // ---- 1. resolve edges on the LINEAR scene (FXAA 3.11 quality-lite) ----
    vec3 scene = texture2D(tScene, uv).rgb;
    if (uFxaa > 0.5) {
      float lNW = plum(uv + vec2(-uTexel.x, -uTexel.y));
      float lNE = plum(uv + vec2( uTexel.x, -uTexel.y));
      float lSW = plum(uv + vec2(-uTexel.x,  uTexel.y));
      float lSE = plum(uv + vec2( uTexel.x,  uTexel.y));
      float lM  = sqrt(luma(aces(scene * uExposure)));
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin > max(0.0312, lMax * 0.125)) {
        vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
        float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
        float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
        dir = clamp(dir * rcpDir, -8.0, 8.0) * uTexel;
        vec3 rgbA = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb
                         + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
        vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb
                                       + texture2D(tScene, uv + dir * 0.5).rgb);
        float lB = sqrt(luma(aces(rgbB * uExposure)));
        scene = (lB < lMin || lB > lMax) ? rgbA : rgbB;
      }
    }

    // ---- 2. overlay focus: depth-blended blur (near hero stays sharp) ----
    float depth = linDepth(uv);
    if (uFocus > 0.001) {
      float blurAmt = uFocus * smoothstep(2.5, 14.0, depth);
      scene = mix(scene, texture2D(tBlur, uv).rgb, blurAmt);
    }

    // ---- 3. bloom, exposure, tone map ----
    vec3 bloom = texture2D(tBloom, uv).rgb;
    vec3 col = scene + bloom * uBloom;
    col *= uExposure;
    col = aces(col);

    // ---- 4. grade: cool shadows, warm highlights, gentle S-curve ----
    float l = luma(col);
    col *= mix(uShadowTint, uHighTint, smoothstep(0.08, 0.72, l));
    col = mix(vec3(l), col, uSaturation);
    col = col * col * (3.0 - 2.0 * col) * 0.34 + col * 0.66;   // soft contrast

    // ---- 5. ink outline from depth: 2 px near → 1 px far, local colour darkened ----
    if (uOutline > 0.001) {
      float w = mix(2.0, 1.0, smoothstep(6.0, 60.0, depth)) * uPixelRatio;
      vec2 ox = vec2(uTexel.x * w, 0.0), oy = vec2(0.0, uTexel.y * w);
      float dL = linDepth(uv - ox), dR = linDepth(uv + ox);
      float dU = linDepth(uv - oy), dD = linDepth(uv + oy);
      // second-derivative test: planes cancel, silhouettes on the NEAR side don't
      float ex = max(0.0, (dL - depth) + (dR - depth));
      float ey = max(0.0, (dU - depth) + (dD - depth));
      float e = (ex + ey) / max(depth, 0.5);
      float edge = smoothstep(0.035, 0.11, e) * uOutline * (1.0 - smoothstep(120.0, 260.0, depth));
      col = mix(col, col * uInk, edge);
    }

    // overlay open: pull saturation and light so the panel owns the frame
    if (uFocus > 0.001) {
      col = mix(col, vec3(luma(col)), uFocus * 0.45);
      col *= 1.0 - uFocus * 0.16;
    }

    // vignette
    col *= 1.0 - uVignette * smoothstep(0.15, 0.72, r2);

    // grain: two decorrelated hashes summed give a triangular distribution
    // (soft, film-like) rather than a flat speckle; fades out of the highlights
    float g = hash(uv * 1024.0 + fract(uFrame * 0.137) * 91.7) + hash(uv * 977.0 - fract(uFrame * 0.311) * 53.1) - 1.0;
    col += g * uGrain * (1.0 - smoothstep(0.55, 1.0, l));

    col += uFlash;
    gl_FragColor = vec4(toSRGB(col), 1.0);
  }
`;

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.levels = 5;
    this.width = 1;
    this.height = 1;
    this.flash = 0;
    this.frame = 0;
    this.focus = 0;
    this.focusTarget = 0;
    this.samples = 0;
    this.threshold = 0.9;
    this.bloomStrength = 0.6;

    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(QUAD, null);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    const mk = (frag, uniforms) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
    });
    this.downMat = mk(DOWN_FRAG, {
      tSrc: { value: null }, uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: -1 }, uKnee: { value: 0.35 },
    });
    this.upMat = mk(UP_FRAG, {
      tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 },
    });
    this.upMat.blending = THREE.AdditiveBlending;
    this.compositeMat = mk(COMPOSITE_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, tDepth: { value: null }, tBlur: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uNearFar: { value: new THREE.Vector2(0.1, 1200) },
      uBloom: { value: 0.55 }, uExposure: { value: 1.0 },
      uVignette: { value: 0.3 }, uGrain: { value: 0.028 },
      uFrame: { value: 0 }, uFxaa: { value: 0 },
      uFlash: { value: 0 }, uOutline: { value: 1 }, uPixelRatio: { value: 1 },
      uFocus: { value: 0 },
      uInk: { value: new THREE.Color(0x3a2a4a) },
      uShadowTint: { value: new THREE.Vector3(0.94, 0.95, 1.06) },
      uHighTint: { value: new THREE.Vector3(1.06, 1.0, 0.94) },
      uSaturation: { value: 1.08 },
    });

    this.sceneRT = null;
    this.bloomRTs = [];
    this.blurRTs = [];
    this.bloomScale = 0.5;
  }

  // settings comes from quality.js
  configure(s) {
    const on = !!s.postfx;
    this.bloomEnabled = !!s.bloom;
    this.bloomScale = s.bloomScale ?? 0.5;
    this.samples = s.aa === 'msaa' ? (s.rtSamples ?? 4) : 0;
    this.compositeMat.uniforms.uFxaa.value = s.aa === 'fxaa' ? 1 : 0;
    this.compositeMat.uniforms.uGrain.value = s.postfx ? (s.grain ?? 0.028) : 0;
    this.compositeMat.uniforms.uOutline.value = s.outline ?? 1;
    this.dofEnabled = s.dof !== false;
    document.body.classList.toggle('postfx', on);
    if (on !== this.enabled) {
      this.enabled = on;
      this._applyRendererMode();
      if (on) this.setSize(this.width, this.height, this.pixelRatio || 1);
      else this.dispose();
    } else if (on) {
      this.setSize(this.width, this.height, this.pixelRatio || 1);
    }
  }

  // Look parameters come from daylight.js as the time of day moves.
  setLook({ exposure, bloomThreshold, bloomStrength, ink, shadowTint, highTint, saturation }) {
    const u = this.compositeMat.uniforms;
    if (exposure !== undefined) u.uExposure.value = exposure;
    if (bloomThreshold !== undefined) this.threshold = bloomThreshold;
    if (bloomStrength !== undefined) this.bloomStrength = bloomStrength;
    if (ink) u.uInk.value.copy(ink);
    if (shadowTint) u.uShadowTint.value.copy(shadowTint);
    if (highTint) u.uHighTint.value.copy(highTint);
    if (saturation !== undefined) u.uSaturation.value = saturation;
  }

  // Overlay open/closed: eases the depth blur + desaturation in over ~0.3 s.
  setFocus(open) { this.focusTarget = open ? 1 : 0; }

  // With the composite doing ACES + sRGB, the renderer itself must stay linear
  // and untone-mapped or the image is graded twice.
  _applyRendererMode() {
    if (this.enabled) {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    } else {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.04;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
  }

  setSize(width, height, pixelRatio) {
    this.width = width; this.height = height; this.pixelRatio = pixelRatio;
    if (!this.enabled) return;
    const w = Math.max(2, Math.floor(width * pixelRatio));
    const h = Math.max(2, Math.floor(height * pixelRatio));
    this.dispose();

    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.samples,
    };
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, opts);
    // depth feeds the ink outline and the overlay blur; MSAA targets resolve it
    const depthTex = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    depthTex.format = THREE.DepthFormat;
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;
    this.sceneRT.depthTexture = depthTex;

    this.bloomRTs = [];
    if (this.bloomEnabled) {
      let bw = Math.max(2, Math.floor(w * this.bloomScale));
      let bh = Math.max(2, Math.floor(h * this.bloomScale));
      const levels = Math.max(2, Math.min(this.levels, Math.floor(Math.log2(Math.min(bw, bh))) - 1));
      for (let i = 0; i < levels; i++) {
        this.bloomRTs.push(new THREE.WebGLRenderTarget(bw, bh, { ...opts, samples: 0, depthBuffer: false }));
        bw = Math.max(2, bw >> 1);
        bh = Math.max(2, bh >> 1);
      }
    }
    // un-thresholded half + quarter chain for the overlay blur (only rendered
    // while an overlay is open)
    this.blurRTs = [
      new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { ...opts, samples: 0, depthBuffer: false }),
      new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), { ...opts, samples: 0, depthBuffer: false }),
    ];
    this.compositeMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.compositeMat.uniforms.uPixelRatio.value = Math.max(1, pixelRatio);
  }

  setFlash(v) { this.compositeMat.uniforms.uFlash.value = v; }

  _blit(material, target) {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(elapsed, dt = 1 / 60) {
    const r = this.renderer;
    this.frame++;
    // ease the overlay focus in/out over ~0.3 s
    if (this.focus !== this.focusTarget) {
      const step = dt / 0.3;
      this.focus = this.focus < this.focusTarget
        ? Math.min(this.focusTarget, this.focus + step)
        : Math.max(this.focusTarget, this.focus - step);
    }
    if (!this.enabled || !this.sceneRT) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);

    let bloomTex = null;
    if (this.bloomEnabled && this.bloomRTs.length) {
      // down: threshold on the first hop only
      let src = this.sceneRT;
      for (let i = 0; i < this.bloomRTs.length; i++) {
        const dst = this.bloomRTs[i];
        this.downMat.uniforms.tSrc.value = src.texture;
        this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.downMat.uniforms.uThreshold.value = i === 0 ? this.threshold : -1;
        this._blit(this.downMat, dst);
        src = dst;
      }
      // up: additive tent back down the chain
      for (let i = this.bloomRTs.length - 1; i > 0; i--) {
        const from = this.bloomRTs[i];
        const to = this.bloomRTs[i - 1];
        this.upMat.uniforms.tSrc.value = from.texture;
        this.upMat.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
        this.upMat.uniforms.uRadius.value = 1.0;
        this._blit(this.upMat, to);
      }
      bloomTex = this.bloomRTs[0].texture;
    }

    // overlay blur chain: two cheap downsamples, only while something is open
    const focus = this.dofEnabled ? this.focus : 0;
    if (focus > 0.001 && this.blurRTs.length) {
      let src = this.sceneRT;
      for (const dst of this.blurRTs) {
        this.downMat.uniforms.tSrc.value = src.texture;
        this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.downMat.uniforms.uThreshold.value = -1;
        this._blit(this.downMat, dst);
        src = dst;
      }
    }

    const u = this.compositeMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.tBlur.value = this.blurRTs.length ? this.blurRTs[this.blurRTs.length - 1].texture : this.sceneRT.texture;
    u.tBloom.value = bloomTex || this.sceneRT.texture;
    u.uBloom.value = bloomTex ? this.bloomStrength : 0;
    u.uFrame.value = this.frame % 64;
    u.uFocus.value = focus;
    u.uNearFar.value.set(this.camera.near, this.camera.far);
    this._blit(this.compositeMat, null);
  }

  dispose() {
    this.sceneRT?.depthTexture?.dispose();
    this.sceneRT?.dispose();
    this.sceneRT = null;
    for (const rt of this.bloomRTs) rt.dispose();
    this.bloomRTs = [];
    for (const rt of this.blurRTs) rt.dispose();
    this.blurRTs = [];
  }
}
