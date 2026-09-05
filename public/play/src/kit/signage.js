// One canvas atlas per district carries every piece of lettering in it —
// shop fascias, hanging signs, the station nameplate, street name plates — so
// all signage merges into a single textured mesh. Space Grotesk keeps the
// in-world type on the same system as the HUD (v3 rule); the palette comes
// from the district so a Georgian terrace and a Kingston yard letter differently.
import * as THREE from 'three';

const FONT = "'Space Grotesk', 'Segoe UI', sans-serif";

export class SignAtlas {
  constructor(size = 1024) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#0a1024';
    this.ctx.fillRect(0, 0, size, size);
    this.shelfY = 0; this.shelfH = 0; this.shelfX = 0;
    this._tex = null;
  }

  // shelf packer: rows of one height, cells left to right
  alloc(w, h) {
    if (this.shelfX + w > this.size || h !== this.shelfH) {
      this.shelfY += this.shelfH;
      this.shelfH = h;
      this.shelfX = 0;
    }
    if (this.shelfY + h > this.size) return null;       // atlas full — caller skips the sign
    const rect = { x: this.shelfX, y: this.shelfY, w, h };
    this.shelfX += w;
    return rect;
  }

  // Returns UV bounds {u0,v0,u1,v1} (v flipped for three's bottom-left origin).
  uv(rect) {
    const s = this.size;
    return { u0: rect.x / s, u1: (rect.x + rect.w) / s, v0: 1 - (rect.y + rect.h) / s, v1: 1 - rect.y / s };
  }

  fitFont(text, weight, maxPx, maxW) {
    let px = maxPx;
    while (px > 12) {
      this.ctx.font = `${weight} ${px}px ${FONT}`;
      if (this.ctx.measureText(text).width <= maxW) break;
      px -= 2;
    }
    return px;
  }

  // Shop fascia: 512x96, name left/centred, thin accent rule, optional tagline.
  fascia({ text, sub = '', bg = '#1a1430', fg = '#f5f2ff', accent = '#ffb45f', style = 0 }) {
    const r = this.alloc(512, 96);
    if (!r) return null;
    const c = this.ctx;
    c.save();
    c.translate(r.x, r.y);
    c.fillStyle = bg; c.fillRect(0, 0, 512, 96);
    if (style === 1) {                                   // painted border
      c.strokeStyle = accent; c.lineWidth = 6; c.strokeRect(8, 8, 496, 80);
    } else if (style === 2) {                            // stripe awning look
      c.fillStyle = accent; c.fillRect(0, 84, 512, 12);
      for (let i = 0; i < 512; i += 40) { c.fillStyle = i % 80 ? fg : accent; c.fillRect(i, 0, 40, 10); }
    } else {                                             // neon rule
      c.fillStyle = accent; c.fillRect(24, 74, 464, 4);
    }
    const nameW = 464;
    const px = this.fitFont(text.toUpperCase(), 700, sub ? 44 : 50, nameW);
    c.font = `700 ${px}px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = fg;
    c.fillText(text.toUpperCase(), 256, sub ? 36 : 44);
    if (sub) {
      c.font = `600 18px ${FONT}`;
      c.fillStyle = accent;
      c.fillText(sub.toUpperCase(), 256, 66);
    }
    c.restore();
    return this.uv(r);
  }

  // Hanging sign: 192x160, an emblem glyph and a short word.
  hanging({ text, glyph = '●', bg = '#f5f2ff', fg = '#1a1430', accent = '#c04f72' }) {
    const r = this.alloc(192, 160);
    if (!r) return null;
    const c = this.ctx;
    c.save(); c.translate(r.x, r.y);
    c.fillStyle = bg; c.fillRect(0, 0, 192, 160);
    c.strokeStyle = accent; c.lineWidth = 8; c.strokeRect(10, 10, 172, 140);
    c.fillStyle = accent; c.font = `700 62px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(glyph, 96, 62);
    const px = this.fitFont(text.toUpperCase(), 700, 30, 160);
    c.font = `700 ${px}px ${FONT}`; c.fillStyle = fg;
    c.fillText(text.toUpperCase(), 96, 118);
    c.restore();
    return this.uv(r);
  }

  // Station nameplate: 512x168 (matches the old buildStationSign canvas).
  nameplate({ name, dialect, lineHex }) {
    const r = this.alloc(512, 168);
    if (!r) return null;
    const c = this.ctx;
    c.save(); c.translate(r.x, r.y);
    c.fillStyle = '#10172b'; c.fillRect(0, 0, 512, 168);
    c.fillStyle = lineHex; c.fillRect(0, 0, 512, 26);
    c.fillStyle = '#f5f2ff';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const px = this.fitFont(name, 700, 46, 480);
    c.font = `700 ${px}px ${FONT}`;
    c.fillText(name, 256, 88);
    c.font = `600 23px ${FONT}`;
    c.fillStyle = '#79f5ec';
    c.fillText(dialect, 256, 132);
    c.restore();
    return this.uv(r);
  }

  // Street name plate: 256x64 white on ink (UK) / green (US) / blue (FR-CA).
  streetPlate({ text, bg = '#f5f2ff', fg = '#10172b', accent = '#10172b' }) {
    const r = this.alloc(256, 64);
    if (!r) return null;
    const c = this.ctx;
    c.save(); c.translate(r.x, r.y);
    c.fillStyle = bg; c.fillRect(0, 0, 256, 64);
    c.strokeStyle = accent; c.lineWidth = 4; c.strokeRect(4, 4, 248, 56);
    const px = this.fitFont(text.toUpperCase(), 700, 30, 232);
    c.font = `700 ${px}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = fg; c.fillText(text.toUpperCase(), 128, 33);
    c.restore();
    return this.uv(r);
  }

  texture() {
    if (this._tex) { this._tex.needsUpdate = true; return this._tex; }
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this._tex = tex;
    return tex;
  }
}

// Shop names from the district's own cast: "Big Norm's Stotties", "Máire's
// Fish", plus the landmark's title, so the lettering on a street is the same
// world the locals talk about.
const ROLE_WORDS = [
  [/fish/i, 'Fish'], [/bak/i, 'Bakery'], [/butch/i, 'Butcher'], [/barber/i, 'Barber'],
  [/cafe|café|coffee|barista|roast/i, 'Coffee'], [/pub|landlord|bar\b|barman/i, 'Tavern'],
  [/book|librar/i, 'Books'], [/flower|florist/i, 'Flowers'], [/tailor|dress|seam/i, 'Tailor'],
  [/music|record|dj|sound|steelpan|pan\b|fiddl|piper|busker|singer/i, 'Records'],
  [/tea/i, 'Tearoom'], [/chip|fry|takeaway|grill|braai|kitchen|cook|chef|curry|food|jerk|noodle|pizza|diner|dep\b|bodega|spaza|dairy/i, 'Kitchen'],
  [/market|stall|vendor|monger|coster|grocer/i, 'Market'], [/surf|board|skate/i, 'Surf'],
  [/farm|orchard|cider|dairy|croft|shepherd/i, 'Farm Shop'], [/boat|ferr|dock|fisher|harbour|wharf|skipper/i, 'Chandlery'],
  [/guide|tour|ranger|warden/i, 'Tours'], [/knit|wool|yarn|mill/i, 'Woollens'], [/tattoo|ink/i, 'Ink'],
  [/carv|craft|artist|painter|potter|weav/i, 'Studio'], [/pharm|chem|doctor|nurse/i, 'Pharmacy'],
  [/taxi|driver|cab|mechanic|garage/i, 'Motors'], [/hotel|inn|b&b|host/i, 'Rooms'],
];

export function shopNamesFor(zoneData) {
  const names = [];
  for (const npc of zoneData.npcs || []) {
    const first = String(npc.name || '').replace(/^(mrs?|ms|miss|dr|uncle|auntie|aunty|big|wee|pearly queen|gogo|boeta)\.?\s+/i, '').split(/\s+/)[0] || 'Local';
    const role = String(npc.role || '');
    const word = (ROLE_WORDS.find(([re]) => re.test(role)) || [null, 'Stores'])[1];
    const possessive = first.endsWith('s') ? `${first}'` : `${first}'s`;
    names.push({ text: `${possessive} ${word}`, sub: role.split(/[,(]/)[0].trim().slice(0, 28) });
  }
  const lm = String(zoneData.landmark || '').split(/\s[—-]\s/)[0].trim();
  if (lm && lm.length < 30) names.push({ text: lm, sub: zoneData.zoneName });
  for (const ex of (zoneData.streetExercises || []).slice(0, 3)) {
    const role = String(ex.role || '').trim();
    if (!role) continue;
    const word = (ROLE_WORDS.find(([re]) => re.test(role)) || [null, null])[1];
    if (word) names.push({ text: `The ${role.replace(/^(a|an|the)\s+/i, '')}`.slice(0, 26), sub: word });
  }
  if (!names.length) names.push({ text: zoneData.zoneName, sub: zoneData.dialect });
  return names;
}
