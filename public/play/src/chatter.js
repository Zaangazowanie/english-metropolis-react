// Ambient dialect chatter over the instanced crowd.
//
// The point of the city is that every district speaks its own English, so the
// people in it have to be heard, not just seen. Each district's locals draw
// their lines from that district's own phrasebook, which means walking two
// stops down the Isles line genuinely sounds different.
//
// Cost control: a fixed pool of speech bubbles (six by default) is shared by
// the entire crowd. Each pooled sprite owns one canvas that is redrawn when it
// is handed to a new speaker, so hundreds of walkers never allocate hundreds of
// textures — the ceiling is the pool, not the population.
import * as THREE from 'three';

const BUBBLE_W = 512, BUBBLE_H = 224;

function drawBubble(ctx, text, thought) {
  ctx.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
  const r = 26, x0 = 14, y0 = 12, w = 484, h = 132;
  ctx.fillStyle = 'rgba(250,248,255,0.96)';
  ctx.strokeStyle = thought ? 'rgba(94,203,255,0.6)' : 'rgba(139,92,246,0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, r);
  ctx.fill(); ctx.stroke();
  if (thought) {
    for (const [cx, cy, cr] of [[150, 168, 15], [118, 196, 9]]) {
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(150, y0 + h - 3); ctx.lineTo(122, 200); ctx.lineTo(196, y0 + h - 3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(150, y0 + h - 2); ctx.lineTo(122, 200); ctx.lineTo(196, y0 + h - 2); ctx.stroke();
  }
  ctx.fillStyle = '#1b1030';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // shrink-to-fit over two lines rather than clipping a long local phrase
  let size = 34;
  let lines = wrap(ctx, text, size, w - 40);
  while (lines.length > 2 && size > 22) {
    size -= 3;
    lines = wrap(ctx, text, size, w - 40);
  }
  lines = lines.slice(0, 2);
  ctx.font = `${thought ? 'italic ' : ''}600 ${size}px 'Space Grotesk', sans-serif`;
  const cy = y0 + h / 2;
  if (lines.length === 1) ctx.fillText(lines[0], x0 + w / 2, cy);
  else {
    ctx.fillText(lines[0], x0 + w / 2, cy - size * 0.62);
    ctx.fillText(lines[1], x0 + w / 2, cy + size * 0.62);
  }
}

function wrap(ctx, text, size, maxWidth) {
  ctx.font = `600 ${size}px 'Space Grotesk', sans-serif`;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) { lines.push(line); line = word; }
    else line = attempt;
  }
  if (line) lines.push(line);
  return lines;
}

export class Chatter {
  constructor(scene, { pool = 6 } = {}) {
    this.scene = scene;
    this.lines = {};
    this.slots = [];
    for (let i = 0; i < pool; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = BUBBLE_W; canvas.height = BUBBLE_H;
      const ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, toneMapped: false,
      }));
      sprite.scale.set(2.35, 1.03, 1);
      sprite.visible = false;
      sprite.renderOrder = 6;
      scene.add(sprite);
      this.slots.push({ canvas, ctx, tex, sprite, agent: null, life: 0 });
    }
    this.pickTimer = 0;
  }

  // byDialect: { <district code>: { say: [...], think: [...] } }
  setLines(byDialect) { this.lines = byDialect || {}; }

  linesFor(code) {
    return this.lines[code] || this.lines.hub || { say: [], think: [] };
  }

  clearAgent(agent) {
    for (const slot of this.slots) {
      if (slot.agent === agent) { slot.agent = null; slot.life = 0; slot.sprite.visible = false; }
    }
  }

  update(dt, crowd, playerPos, radius = 34) {
    for (const slot of this.slots) {
      if (!slot.agent) continue;
      slot.life -= dt;
      // a district can stream out mid-sentence; drop the bubble rather than
      // leaving it hanging over an empty street
      if (slot.life <= 0 || (crowd && !crowd.isLive(slot.agent))) {
        slot.agent = null; slot.sprite.visible = false; continue;
      }
      slot.sprite.position.set(
        slot.agent.x,
        slot.agent.y + slot.agent.height * 1.22 + Math.sin(slot.life * 3) * 0.02,
        slot.agent.z,
      );
    }

    this.pickTimer -= dt;
    if (this.pickTimer > 0 || !crowd) return;
    this.pickTimer = 0.55;

    const free = this.slots.find((s) => !s.agent);
    if (!free) return;
    // one candidate scan, nearest-band only — the crowd list is already sorted
    // by distance most frames, so this stops at the first eligible local
    const r2 = radius * radius;
    const busy = new Set(this.slots.map((s) => s.agent).filter(Boolean));
    const candidates = [];
    for (const a of crowd.agents) {
      if (busy.has(a)) continue;
      const dx = a.x - playerPos.x, dz = a.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2 || d2 < 9) continue;
      candidates.push(a);
      if (candidates.length >= 24) break;
    }
    if (!candidates.length) return;
    const agent = candidates[(Math.random() * candidates.length) | 0];
    const pack = this.linesFor(agent.dialect);
    const thought = Math.random() < 0.26 && pack.think?.length;
    const pool = thought ? pack.think : pack.say;
    if (!pool?.length) return;
    drawBubble(free.ctx, pool[(Math.random() * pool.length) | 0], !!thought);
    free.tex.needsUpdate = true;
    free.agent = agent;
    free.life = 3.6;
    free.sprite.visible = true;
  }
}
