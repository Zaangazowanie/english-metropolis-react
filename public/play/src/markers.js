// Overhead quest markers for teaching NPCs — the classic RPG "!" (exercises
// available this round) and "✓" (done, come back next round). One shared
// texture + material per state; each teacher gets its own cheap Sprite that
// bobs and pulses in World.update.
import * as THREE from 'three';

function glyphTexture(glyph, fill, glow) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 128;
  const ctx = c.getContext('2d');
  // soft glow disc behind the glyph so it reads at distance
  const g = ctx.createRadialGradient(48, 60, 6, 48, 60, 46);
  g.addColorStop(0, glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 128);
  ctx.font = '900 84px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(42,30,18,0.95)';
  ctx.strokeText(glyph, 48, 62);
  ctx.fillStyle = fill;
  ctx.fillText(glyph, 48, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  return tex;
}

const matAvail = new THREE.SpriteMaterial({
  map: glyphTexture('!', '#ffb84d', 'rgba(232,161,61,0.5)'),
  transparent: true, depthWrite: false,
});
const matDone = new THREE.SpriteMaterial({
  map: glyphTexture('✓', '#8fd460', 'rgba(93,143,66,0.45)'),
  transparent: true, depthWrite: false, opacity: 0.85,
});

// Attach a marker sprite to a teacher entry. `height` is metres above the
// group origin (local units — parent scale applies). Adds entry.marker,
// entry.markerY and entry.refreshMarker().
export function attachMarker(entry, height = 2.3) {
  const sprite = new THREE.Sprite(entry.done ? matDone : matAvail);
  sprite.position.y = height;
  sprite.scale.set(0.6, 0.8, 1);
  sprite.renderOrder = 5;
  entry.obj.add(sprite);
  entry.marker = sprite;
  entry.markerY = height;
  entry.refreshMarker = () => { sprite.material = entry.done ? matDone : matAvail; };
  return sprite;
}
