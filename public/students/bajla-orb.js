/**
 * Bajla voice orb (three.js, loaded on demand by conversa-widget-v5.js)
 * ---------------------------------------------------------------------------
 * A small live 3D orb that sits inside the microphone button while the student
 * is recording. It is an INSTRUMENT, not decoration:
 *
 *   • its surface displacement and the ring around it follow the microphone
 *     level in real time (setLevel 0..1), so the student can see that Bajla is
 *     hearing them and how loudly;
 *   • its colour settles to the pronunciation score once Bajla has marked the
 *     recording (setColor), the same green / amber / red the score ring uses;
 *   • setMode('cancel') greys it while the finger has slid off the button, so
 *     "release to cancel" is visible in the orb itself.
 *
 * The widget only imports this module the first time the mic is pressed, and
 * only when WebGL is available and the user has not asked for reduced motion.
 * Every failure (module 404, no WebGL, context loss) falls back to the CSS ring
 * inside the widget, so nothing here is load-bearing.
 *
 * Pixel ratio is capped at 1.5 and dispose() releases the GL context.
 */
import * as THREE from '/students/vendor/three.module.min.js?v=0.184.0';

var VERT = [
  'uniform float uTime;',
  'uniform float uLevel;',
  'varying vec3 vNormal;',
  'varying float vDisp;',
  // Cheap 3D value noise: enough for a 40px orb, no texture lookups.
  'float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }',
  'float noise(vec3 p){',
  '  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),',
  '                mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);',
  '  return n * 2.0 - 1.0;',
  '}',
  'void main(){',
  '  vNormal = normalize(normalMatrix * normal);',
  '  float n = noise(position * 2.2 + vec3(uTime * 0.9, uTime * 0.6, 0.0));',
  '  float amp = 0.04 + uLevel * 0.42;',
  '  vDisp = n * amp;',
  '  vec3 p = position + normal * vDisp;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
  '}'
].join('\n');

var FRAG = [
  'uniform vec3 uColor;',
  'uniform float uLevel;',
  'varying vec3 vNormal;',
  'varying float vDisp;',
  'void main(){',
  '  float fres = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.2);',
  '  vec3 base = uColor * (0.72 + vDisp * 1.6 + uLevel * 0.25);',
  '  vec3 col = mix(base, vec3(1.0), fres * 0.65);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}'
].join('\n');

export function createOrb(host, opts) {
  opts = opts || {};
  var size = opts.size || host.clientWidth || 40;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  var canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  camera.position.z = 3.6;

  var color = new THREE.Color(opts.color || '#FB7185');
  var target = color.clone();
  var uniforms = {
    uTime: { value: 0 },
    uLevel: { value: 0 },
    uColor: { value: color }
  };
  var geo = new THREE.IcosahedronGeometry(0.72, 4);
  var mat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG });
  var orb = new THREE.Mesh(geo, mat);
  scene.add(orb);

  // The ring is the level meter proper: its radius is the smoothed level, so a
  // quiet room reads as a tight halo and speech pushes it out to the edge.
  var ringGeo = new THREE.TorusGeometry(0.98, 0.035, 8, 64);
  var ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.85 });
  var ring = new THREE.Mesh(ringGeo, ringMat);
  scene.add(ring);

  var level = 0, shown = 0, alive = true, raf = null, t0 = performance.now();
  var greyed = false;

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    var t = (now - t0) / 1000;
    // Attack fast, release slow: speech should snap the orb open and let it
    // breathe back down, the way a VU meter does.
    shown += (level - shown) * (level > shown ? 0.45 : 0.08);
    uniforms.uTime.value = t;
    uniforms.uLevel.value = shown;
    color.lerp(target, 0.08);
    ringMat.color.copy(color);
    var r = 0.92 + shown * 0.5;
    ring.scale.set(r, r, 1);
    ringMat.opacity = 0.35 + shown * 0.6;
    orb.rotation.y = t * 0.35;
    orb.rotation.x = Math.sin(t * 0.5) * 0.2;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function onLost(e) { e.preventDefault(); if (opts.onLost) opts.onLost(); }
  canvas.addEventListener('webglcontextlost', onLost, false);

  return {
    canvas: canvas,
    setLevel: function (v) { level = Math.max(0, Math.min(1, v || 0)); },
    setColor: function (hex) { try { target.set(hex); } catch (e) { /* keep current */ } greyed = false; },
    setMode: function (mode) {
      if (mode === 'cancel') { greyed = true; target.set('#8A83AE'); level = 0; }
      else if (mode === 'wait') { target.set('#A855F7'); level = 0; }
    },
    isGreyed: function () { return greyed; },
    dispose: function () {
      if (!alive) return;
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      geo.dispose(); mat.dispose(); ringGeo.dispose(); ringMat.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* already gone */ }
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}
