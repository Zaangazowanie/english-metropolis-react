// HUD minimap: live top-down view centered on the player — metro lines, station
// exercise states (● done / ○ open), moving trains, nearby teachers, hub, and a
// heading arrow. Click opens the full city map.
import { LINES } from './zones.js';

const VIEW_R = 150;          // metres of world shown around the player

// Fog of war: coarse visited grid over the 1000m world, persisted so the city
// stays discovered between sessions.
const GRID = 64, WORLD = 1000, CELL = WORLD / GRID;   // 15.6m cells
const REVEAL_R = 42;                                   // metres seen around you

class Fog {
  constructor() {
    this.cells = new Uint8Array(GRID * GRID);
    try {
      const raw = localStorage.getItem('em_fog');
      if (raw) {
        const bin = atob(raw);
        for (let i = 0; i < Math.min(bin.length, this.cells.length); i++) this.cells[i] = bin.charCodeAt(i);
      }
    } catch { /* fresh fog */ }
    this._dirty = 0;
  }

  idx(wx, wz) {
    const cx = Math.floor((wx + WORLD / 2) / CELL);
    const cz = Math.floor((wz + WORLD / 2) / CELL);
    if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) return -1;
    return cz * GRID + cx;
  }

  visited(wx, wz) { const i = this.idx(wx, wz); return i < 0 ? false : this.cells[i] === 1; }

  reveal(wx, wz) {
    const r = Math.ceil(REVEAL_R / CELL);
    const cx = Math.floor((wx + WORLD / 2) / CELL);
    const cz = Math.floor((wz + WORLD / 2) / CELL);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > r * r + 1) continue;
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= GRID || z >= GRID) continue;
      const i = z * GRID + x;
      if (!this.cells[i]) { this.cells[i] = 1; this._dirty++; }
    }
    if (this._dirty >= 12) this.save();
  }

  save() {
    this._dirty = 0;
    let bin = '';
    for (let i = 0; i < this.cells.length; i++) bin += String.fromCharCode(this.cells[i]);
    try { localStorage.setItem('em_fog', btoa(bin)); } catch { /* ignore */ }
  }
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.acc = 0;
    this.fog = new Fog();
    window.addEventListener('beforeunload', () => this.fog.save());
    // offscreen fog texture (one pixel per cell, padded so beyond-the-world
    // stays fogged) — drawn scaled with bilinear smoothing + a light blur so
    // the fog edge is soft, not blocky
    this.fogPad = 12;
    const P = GRID + this.fogPad * 2;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.fogCanvas.height = P;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogImage = this.fogCtx.createImageData(P, P);
  }

  refreshFogTexture() {
    const P = GRID + this.fogPad * 2, data = this.fogImage.data;
    for (let z = 0; z < P; z++) {
      for (let x = 0; x < P; x++) {
        const gx = x - this.fogPad, gz = z - this.fogPad;
        const seen = gx >= 0 && gz >= 0 && gx < GRID && gz < GRID && this.fog.cells[gz * GRID + gx];
        const o = (z * P + x) * 4;
        data[o] = 6; data[o + 1] = 5; data[o + 2] = 4;          // near-black
        data[o + 3] = seen ? 0 : 244;
      }
    }
    this.fogCtx.putImageData(this.fogImage, 0, 0);
  }

  update(dt, player, zoneMgr, world, trains) {
    this.acc -= dt;
    if (this.acc > 0) return;
    this.acc = 0.2;                    // 5 Hz redraw
    this.fog.reveal(player.pos.x, player.pos.z);
    const ctx = this.ctx;
    const W = this.canvas.width, C = W / 2, S = W / (VIEW_R * 2);
    const px = player.pos.x, pz = player.pos.z;
    const X = (wx) => C + (wx - px) * S;
    const Y = (wz) => C + (wz - pz) * S;

    ctx.clearRect(0, 0, W, W);
    // circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, C - 2, 0, Math.PI * 2);
    ctx.clip();
    // paper base
    ctx.fillStyle = 'rgba(239,224,192,0.92)';
    ctx.fillRect(0, 0, W, W);

    // metro lines
    const lineColors = { isles: '#7ba05b', liberty: '#8fb4c9', sunward: '#e8a13d' };
    for (const [key, L] of Object.entries(LINES)) {
      ctx.strokeStyle = lineColors[key];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo(X(Math.cos(L.angle) * 420), Y(-Math.sin(L.angle) * 420));
      ctx.stroke();
    }

    // stations: exercise state — green = zone complete, white = open
    for (const z of zoneMgr.zones) {
      const sx = X(z.stopPos.x), sy = Y(z.stopPos.y);
      if (sx < -8 || sx > W + 8 || sy < -8 || sy > W + 8) continue;
      if (!this.fog.visited(z.stopPos.x, z.stopPos.y)) continue;   // undiscovered
      const done = zoneMgr.progressFor(z.data.code).laps >= 1;   // full round done
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = done ? '#5d8f42' : '#fdf6e3';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#4a3826';
      ctx.stroke();
    }

    // hub
    ctx.beginPath(); ctx.arc(X(0), Y(0), 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#6b4fa0'; ctx.fill();
    ctx.strokeStyle = '#fdf6e3'; ctx.lineWidth = 1.6; ctx.stroke();

    // trains (moving line-coloured dots)
    if (trains) {
      for (const t of trains.trains) {
        const head = t.cars[0].position;
        const tx = X(head.x), ty = Y(head.z);
        if (tx < 0 || tx > W || ty < 0 || ty > W) continue;
        if (!this.fog.visited(head.x, head.z)) continue;
        ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#' + t.color.toString(16).padStart(6, '0');
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // nearby teachers: amber = drill available, green = already helped
    for (const n of world.npcs) {
      const nx = X(n.obj.position.x), ny = Y(n.obj.position.z);
      if (nx < 0 || nx > W || ny < 0 || ny > W) continue;
      if (!this.fog.visited(n.obj.position.x, n.obj.position.z)) continue;
      ctx.beginPath(); ctx.arc(nx, ny, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = n.done ? '#5d8f42' : '#e8a13d';
      ctx.fill();
    }

    // fog of war: unexplored world sits under smooth near-black fog — the
    // visited grid is rasterised to a tiny texture and scaled up with
    // bilinear filtering + a light blur so edges roll off softly
    this.refreshFogTexture();
    const sw = (VIEW_R * 2) / CELL;
    const bleed = 6, bleedSrc = bleed * sw / W;   // overdraw so the blur has data at the rim
    const sx = (px - VIEW_R + WORLD / 2) / CELL + this.fogPad - bleedSrc;
    const sz = (pz - VIEW_R + WORLD / 2) / CELL + this.fogPad - bleedSrc;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'blur(3px)';
    ctx.drawImage(this.fogCanvas, sx, sz, sw + bleedSrc * 2, sw + bleedSrc * 2,
      -bleed, -bleed, W + bleed * 2, W + bleed * 2);
    ctx.filter = 'none';
    // soft edge haze so the rim fades into darkness
    const haze = ctx.createRadialGradient(C, C, C * 0.55, C, C, C);
    haze.addColorStop(0, 'rgba(6,5,4,0)');
    haze.addColorStop(1, 'rgba(6,5,4,0.5)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, W);

    // player arrow (heading-up triangle at centre)
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(Math.PI - player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#c9302c';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    ctx.restore();
    // rim
    ctx.beginPath();
    ctx.arc(C, C, C - 2, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(74,56,38,0.85)';
    ctx.stroke();
  }
}
