// Screen-space finish for the city: dual-filter bloom, ACES tone mapping, a
// filmic grade, vignette, grain and optional FXAA — all folded into ONE
// composite pass so the whole stack costs a handful of fullscreen draws.
//
// Why it is built this way rather than with EffectComposer: the scene renders
// into a half-float target with tone mapping OFF, so neon can legitimately
// exceed 1.0 and the bloom threshold has something real to find. Tone mapping,
// colour grading and the sRGB encode all happen once, in the composite, instead
// of being smeared across passes. On the weakest tier the whole file is bypassed
// and the renderer draws straight to the canvas exactly as it used to.
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
  uniform vec2 uTexel;
  uniform float uBloom;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uAberration;
  uniform float uTime;
  uniform float uFxaa;
  uniform float uFlash;        // white-out used by the metro travel fade
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

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 uv = vUv;
    vec2 fromCentre = uv - 0.5;
    float r2 = dot(fromCentre, fromCentre);

    // lateral chromatic aberration, strictly at the edges
    vec3 scene;
    if (uAberration > 0.0) {
      float amt = uAberration * r2;
      scene.r = texture2D(tScene, uv - fromCentre * amt).r;
      scene.g = texture2D(tScene, uv).g;
      scene.b = texture2D(tScene, uv + fromCentre * amt).b;
    } else {
      scene = texture2D(tScene, uv).rgb;
    }

    vec3 bloom = texture2D(tBloom, uv).rgb;
    vec3 col = scene + bloom * uBloom;

    col *= uExposure;
    col = aces(col);

    // --- grade: cool shadows, warm neon-adjacent highlights, gentle S-curve ---
    float l = luma(col);
    vec3 shadowTint = vec3(0.90, 0.93, 1.06);
    vec3 highTint   = vec3(1.05, 0.99, 0.96);
    col *= mix(shadowTint, highTint, smoothstep(0.08, 0.72, l));
    col = mix(vec3(l), col, 1.06);                     // saturation
    col = col * col * (3.0 - 2.0 * col) * 0.34 + col * 0.66;   // soft contrast

    // vignette
    col *= 1.0 - uVignette * smoothstep(0.15, 0.72, r2);

    // grain, tuned to fade out of the highlights so neon stays clean
    float g = hash(uv * 1024.0 + fract(uTime) * 91.7) - 0.5;
    col += g * uGrain * (1.0 - smoothstep(0.55, 1.0, l));

    col += uFlash;
    col = toSRGB(col);

    // FXAA on the graded, encoded image (where the eye actually sees the edges)
    if (uFxaa > 0.5) {
      float lNW = luma(toSRGB(aces(texture2D(tScene, uv + vec2(-uTexel.x, -uTexel.y)).rgb * uExposure)));
      float lNE = luma(toSRGB(aces(texture2D(tScene, uv + vec2( uTexel.x, -uTexel.y)).rgb * uExposure)));
      float lSW = luma(toSRGB(aces(texture2D(tScene, uv + vec2(-uTexel.x,  uTexel.y)).rgb * uExposure)));
      float lSE = luma(toSRGB(aces(texture2D(tScene, uv + vec2( uTexel.x,  uTexel.y)).rgb * uExposure)));
      float lM  = luma(col);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
      float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
      dir = clamp(dir * rcpDir, -8.0, 8.0) * uTexel;
      vec3 rgbA = 0.5 * (
        toSRGB(aces(texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb * uExposure)) +
        toSRGB(aces(texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb * uExposure)));
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        toSRGB(aces(texture2D(tScene, uv - dir * 0.5).rgb * uExposure)) +
        toSRGB(aces(texture2D(tScene, uv + dir * 0.5).rgb * uExposure)));
      float lB = luma(rgbB);
      vec3 aa = (lB < lMin || lB > lMax) ? rgbA : rgbB;
      col = mix(col, aa + bloom * uBloom * 0.0, 0.85);
    }

    gl_FragColor = vec4(col, 1.0);
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
      tScene: { value: null }, tBloom: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uBloom: { value: 0.55 }, uExposure: { value: 1.05 },
      uVignette: { value: 0.34 }, uGrain: { value: 0.035 },
      uAberration: { value: 0.0 }, uTime: { value: 0 }, uFxaa: { value: 0 },
      uFlash: { value: 0 },
    });

    this.sceneRT = null;
    this.bloomRTs = [];
    this.bloomScale = 0.5;
  }

  // settings comes from quality.js
  configure(s) {
    const on = !!s.postfx;
    this.bloomEnabled = !!s.bloom;
    this.bloomScale = s.bloomScale ?? 0.5;
    this.compositeMat.uniforms.uFxaa.value = s.aa === 'fxaa' ? 1 : 0;
    this.compositeMat.uniforms.uAberration.value = s.aa === 'fxaa' && s.wetStreets ? 0.0022 : 0;
    this.compositeMat.uniforms.uGrain.value = s.postfx ? 0.032 : 0;
    this.compositeMat.uniforms.uBloom.value = this.bloomEnabled ? 0.62 : 0;
    if (on !== this.enabled) {
      this.enabled = on;
      this._applyRendererMode();
      if (on) this.setSize(this.width, this.height, this.pixelRatio || 1);
      else this.dispose();
    } else if (on) {
      this.setSize(this.width, this.height, this.pixelRatio || 1);
    }
  }

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
      samples: 0,
    };
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, opts);

    this.bloomRTs = [];
    if (this.bloomEnabled) {
      let bw = Math.max(2, Math.floor(w * this.bloomScale));
      let bh = Math.max(2, Math.floor(h * this.bloomScale));
      const levels = Math.max(2, Math.min(this.levels, Math.floor(Math.log2(Math.min(bw, bh))) - 1));
      for (let i = 0; i < levels; i++) {
        this.bloomRTs.push(new THREE.WebGLRenderTarget(bw, bh, { ...opts, depthBuffer: false }));
        bw = Math.max(2, bw >> 1);
        bh = Math.max(2, bh >> 1);
      }
    }
    this.compositeMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  setFlash(v) { this.compositeMat.uniforms.uFlash.value = v; }

  _blit(material, target) {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(elapsed) {
    const r = this.renderer;
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
        this.downMat.uniforms.uThreshold.value = i === 0 ? 0.78 : -1;
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

    this.compositeMat.uniforms.tScene.value = this.sceneRT.texture;
    this.compositeMat.uniforms.tBloom.value = bloomTex || this.sceneRT.texture;
    this.compositeMat.uniforms.uBloom.value = bloomTex ? 0.82 : 0;
    this.compositeMat.uniforms.uTime.value = elapsed;
    this._blit(this.compositeMat, null);
  }

  dispose() {
    this.sceneRT?.dispose();
    this.sceneRT = null;
    for (const rt of this.bloomRTs) rt.dispose();
    this.bloomRTs = [];
  }
}
