// Overhead quest markers for the locals, in the v3 design language: a Space
// Grotesk 700 glyph on a violet-glass disc. One family for the whole game —
// the street locals' small gold dot (crowd.js) is the same gold on the same
// violet, so the tour can say "gold means someone has something for you".
//
// States per local:  '!'  fresh, exercises waiting (gold)
//                    '?'  warm-up done, the drill is what is left (gold)
//                    '✓'  helped this round (mint)
// Each local gets its own cheap Sprite; the texture per state is shared. The
// sprite fades with distance so a marker never floats over a body the draw
// range has already hidden (world.js hides locals past 44 m).
import * as THREE from 'three';

const GOLD = '#FFBE72', MINT = '#7EF3D9', VIOLET = 'rgba(74, 42, 140, 0.90)', RIM = 'rgba(244,240,255,0.85)';
const FADE_NEAR = 38, FADE_FAR = 50;   // metres from the camera: full → invisible

function drawGlyph(c, glyph, fill) {
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  // soft glow so the disc reads against bright sky and dark asphalt alike
  // (canvas is 96×128 because World.update scales every marker 0.6×0.8: the
  // 3:4 texture makes that scale come out as a round disc)
  const glow = ctx.createRadialGradient(48, 64, 20, 48, 64, 47);
  glow.addColorStop(0, 'rgba(139,92,246,0.35)');
  glow.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 96, 128);
  // violet glass disc with a cream rim
  ctx.beginPath(); ctx.arc(48, 64, 33, 0, Math.PI * 2);
  ctx.fillStyle = VIOLET; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = RIM; ctx.stroke();
  // glyph
  ctx.font = `700 ${glyph === '✓' ? 46 : 52}px 'Space Grotesk', 'Inter', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(glyph, 48, glyph === '?' ? 66 : 65);
}

function glyphTexture(glyph, fill) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 128;
  drawGlyph(c, glyph, fill);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  // redraw once the web font is in, so the glyph is Space Grotesk and not the
  // fallback face the canvas had at module evaluation
  document.fonts?.ready?.then(() => { drawGlyph(c, glyph, fill); tex.needsUpdate = true; });
  return tex;
}

const TEX = {
  avail: glyphTexture('!', GOLD),
  drill: glyphTexture('?', GOLD),
  done: glyphTexture('✓', MINT),
};

const _camPos = new THREE.Vector3(), _pos = new THREE.Vector3();

// Attach a marker sprite to a local's entry. `height` is metres above the
// group origin (local units — parent scale applies). Adds entry.marker,
// entry.markerY, entry.markerState and entry.refreshMarker().
export function attachMarker(entry, height = 2.3) {
  const mat = new THREE.SpriteMaterial({ map: TEX.avail, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.y = height;
  sprite.scale.set(0.6, 0.8, 1);
  sprite.renderOrder = 5;
  sprite.name = 'quest-marker';
  // distance fade, evaluated per draw so it costs nothing on the sim side
  sprite.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldPosition(_camPos);
    sprite.getWorldPosition(_pos);
    const d = _camPos.distanceTo(_pos);
    const a = d <= FADE_NEAR ? 1 : d >= FADE_FAR ? 0 : 1 - (d - FADE_NEAR) / (FADE_FAR - FADE_NEAR);
    mat.opacity = (entry.done ? 0.85 : 1) * a;
  };
  entry.obj.add(sprite);
  entry.marker = sprite;
  entry.markerY = height;
  entry.refreshMarker = () => {
    entry.markerState = entry.done ? 'done' : entry.warmupDone ? 'drill' : 'avail';
    mat.map = TEX[entry.markerState];
    mat.needsUpdate = true;
  };
  entry.refreshMarker();
  return sprite;
}
