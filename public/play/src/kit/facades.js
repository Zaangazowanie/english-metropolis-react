// Facade generator with real depth. Walls are extruded slabs with true
// openings; every opening gets a recessed pane, a frame, a sill and a head;
// doors get fanlights and steps; shopfronts get mullioned glass, a fascia sign
// from the district atlas, awnings, hanging signs and shop lights; roofs come
// in flat-with-furniture, pitched-with-chimneys, mansard, sawtooth, pagoda and
// veranda variants. The archetype pool is read from the zone's authored
// `architecture` text, so a Georgian terrace, a Kingston yard and a Cape Flats
// street build from different rules — all into the same handful of buckets.
import * as THREE from 'three';
import { box, cyl, sphere, cone, prism, faceQuad, wallWithOpenings, orientFace, uvCell, jitterColor, bandColor, mergeAll, FACES } from './shapes.js';
import { awning, fine, mid, IRON, CHROME, BRASS, WOOD, STONE } from './street.js';

// ------------------------------------------------------------ archetypes
const ARCH_KEYWORDS = [
  [/georgian|terrace|crescent|sandstone|tenement|regency|stucco villa|lands\b|closes?\b|wynds?/i, 'georgian'],
  [/brick|victorian|warehouse|mill|viaduct|brownstone|walk-up|walkup|fire escape|stoop|canal/i, 'brick'],
  [/shop|storefront|arcade|market|bodega|diner|dep\b|spaza|dairy|pub|bar\b|cafe|café|record/i, 'shop'],
  [/tower|glass|highrise|high-rise|skyline|gantr|office/i, 'tower'],
  [/industrial|dock|shipyard|container|zinc|shed|works|factory|elevator|water tower/i, 'industrial'],
  [/veranda|verandah|porch|gingerbread|fretwork|chattel|weatherboard|clapboard|villa|timber|cabin|wooden|thatch|cob\b|croft|cottage|fibro|tin-roof|zinc-and-timber|shack|barn/i, 'veranda'],
  [/adobe|stucco|limestone|mesa|whitewashed|cape dutch|gable/i, 'adobe'],
  [/pagoda|temple|wharenui|carved|marae|minaret/i, 'pagoda'],
  [/mansard/i, 'mansard'],
  [/jellybean|candy|rainbow|painted|bright|pastel|colour/i, 'painted'],
];

export function archetypesFor(zoneData) {
  const text = `${zoneData.architecture || ''} ${zoneData.landmark || ''}`;
  const hits = [];
  for (const [re, kind] of ARCH_KEYWORDS) if (re.test(text)) hits.push(kind);
  const flags = {
    bright: /jellybean|candy|rainbow|painted|bright|pastel|soca|carnival|colour/i.test(text),
    tin: /tin|corrugated|zinc|iron awning|fibro/i.test(text),
    thatch: /thatch/i.test(text),
    ironwork: /wrought|lacework|railing|fretwork|balcon/i.test(text),
    bunting: /bunting|festival|fairy|string|lights|lantern|marigold|flags/i.test(text),
    murals: /mural|graffiti|painted/i.test(text),
    lowRise: /cottage|cabin|croft|shack|chattel|bungalow|village|thatch|hut|fibro|weatherboard/i.test(text),
  };
  // frontage = boulevard side (shops); inner = the block behind
  let frontage = [], inner = [];
  const has = (k) => hits.includes(k);
  if (has('georgian')) { frontage.push('georgian', 'shop'); inner.push('georgian', 'georgian'); }
  if (has('brick')) { frontage.push('brick', 'shop'); inner.push('brick', 'brick'); }
  if (has('shop')) { frontage.push('shop', 'shop'); }
  if (has('tower')) { inner.push('tower'); }
  if (has('industrial')) { inner.push('industrial', 'industrial'); frontage.push('industrial'); }
  if (has('veranda')) { frontage.push('veranda', 'veranda'); inner.push('veranda', 'veranda'); }
  if (has('adobe')) { frontage.push('adobe'); inner.push('adobe', 'adobe'); }
  if (has('pagoda')) { frontage.push('pagoda'); inner.push('pagoda'); }
  if (has('mansard')) { frontage.push('mansard', 'mansard'); inner.push('mansard'); }
  if (has('painted')) { frontage.push('painted'); inner.push('painted', 'painted'); }
  if (!frontage.length) frontage = ['shop', 'brick', 'georgian'];
  if (!inner.length) inner = ['brick', 'georgian', 'tower'];
  return { frontage, inner, flags };
}

// Height ranges (m) per archetype; lowRise districts shave them.
const HEIGHTS = {
  georgian: [11, 15], brick: [14, 22], shop: [11, 15], tower: [24, 36], industrial: [9, 14],
  veranda: [6, 9], adobe: [7, 11], pagoda: [8, 13], mansard: [12, 16], painted: [9, 13],
};
const FLOOR_H = { georgian: 3.1, brick: 3.0, shop: 3.0, tower: 3.0, industrial: 4.2, veranda: 3.0, adobe: 3.0, pagoda: 3.4, mansard: 3.0, painted: 2.9 };
const WIN = {
  georgian: { w: 1.0, h: 1.75, pitch: 1.95, sash: true, sill: true, lintel: true },
  brick: { w: 1.15, h: 1.45, pitch: 2.15, arch: true, sill: true },
  shop: { w: 1.1, h: 1.35, pitch: 2.05, sill: true, lintel: true },
  tower: { w: 1.2, h: 1.35, pitch: 1.6 },
  industrial: { w: 1.8, h: 1.55, pitch: 2.6, arch: false, sill: false, grid: true },
  veranda: { w: 1.0, h: 1.4, pitch: 2.3, sill: true, shutters: true },
  adobe: { w: 0.8, h: 1.05, pitch: 2.2, sill: true, shutters: true, deep: true },
  pagoda: { w: 1.2, h: 1.2, pitch: 2.1, grid: true },
  mansard: { w: 1.0, h: 1.6, pitch: 1.95, sill: true, lintel: true },
  painted: { w: 1.0, h: 1.4, pitch: 1.9, sill: true, lintel: true },
};
const THICK = 0.32;

// ---------------------------------------------------------------- helpers
function faceCentre(x, z, w, d, F, off = 0) {
  const ext = (F.nx ? w : d) / 2 + off;
  return { cx: x + F.nx * ext, cz: z + F.nz * ext, span: F.nx ? d : w };
}

// One window opening's dressing. (u, v) opening centre in face coords; the
// face plane passes through (cx, cz). Everything is authored on the +z face
// and swung onto F with orientFace.
function dressWindow(B, T, F, cx, cz, u, v, ow, oh, spec, lit, opts = {}) {
  const at = (geo) => orientFace(geo.translate(u, v, 0), cx, 0, cz, F);
  const paneDepth = spec.deep ? 0.26 : 0.2;
  // pane
  const pane = new THREE.PlaneGeometry(ow - 0.04, oh - 0.04).translate(0, 0, -paneDepth);
  (lit ? B.paneLit : B.paneDark).add(at(pane), lit ? 0xffd9a0 : T.glass);
  if (spec.arch) {
    const cap = new THREE.CircleGeometry(ow / 2 - 0.02, 5, 0, Math.PI).translate(0, oh / 2 - ow / 2, -paneDepth);
    (lit ? B.paneLit : B.paneDark).add(at(cap), lit ? 0xffd9a0 : T.glass);
  }
  if (!B.detail && !opts.forceDetail) {
    if (spec.sill) B.shell.add(at(box(ow + 0.24, 0.09, 0.26, 0, -oh / 2 - 0.05, 0.08)), T.trim);
    return;
  }
  // frame: four flat strips set into the reveal (fine detail — dropped at range)
  const fw = 0.07, fd = -0.1;
  const frameColor = T.frame;
  const FB = fine(B);
  FB.add(at(new THREE.PlaneGeometry(ow, fw).translate(0, oh / 2 - fw / 2, fd)), frameColor);
  FB.add(at(new THREE.PlaneGeometry(ow, fw).translate(0, -oh / 2 + fw / 2, fd)), frameColor);
  FB.add(at(new THREE.PlaneGeometry(fw, oh).translate(-ow / 2 + fw / 2, 0, fd)), frameColor);
  FB.add(at(new THREE.PlaneGeometry(fw, oh).translate(ow / 2 - fw / 2, 0, fd)), frameColor);
  if (spec.sash) {                                    // sash mullion cross
    FB.add(at(new THREE.PlaneGeometry(0.05, oh - 0.1).translate(0, 0, -0.16)), frameColor);
    FB.add(at(new THREE.PlaneGeometry(ow - 0.1, 0.06).translate(0, 0.05, -0.16)), frameColor);
  } else if (spec.grid) {                             // industrial small panes
    FB.add(at(new THREE.PlaneGeometry(0.04, oh - 0.1).translate(-ow / 6, 0, -0.16)), frameColor);
    FB.add(at(new THREE.PlaneGeometry(0.04, oh - 0.1).translate(ow / 6, 0, -0.16)), frameColor);
    FB.add(at(new THREE.PlaneGeometry(ow - 0.1, 0.04).translate(0, 0, -0.16)), frameColor);
  }
  // sill and head: two-plane slabs (top + front) instead of full boxes
  if (spec.sill) {
    B.shell.add(at(new THREE.PlaneGeometry(ow + 0.28, 0.24).rotateX(-Math.PI / 2).translate(0, -oh / 2, 0.12)), T.trim);
    B.shell.add(at(new THREE.PlaneGeometry(ow + 0.28, 0.1).translate(0, -oh / 2 - 0.05, 0.24)), T.trim.clone().multiplyScalar(0.85));
  }
  if (spec.lintel) {
    B.shell.add(at(new THREE.PlaneGeometry(ow + 0.32, 0.16).translate(0, oh / 2 + 0.08, 0.12)), T.trim);
    B.shell.add(at(new THREE.PlaneGeometry(ow + 0.32, 0.12).rotateX(Math.PI / 2).translate(0, oh / 2, 0.06)), T.trim.clone().multiplyScalar(0.7));
  }
  if (spec.arch) FB.add(at(box(0.22, 0.34, 0.14, 0, oh / 2 + 0.1, 0.06)), T.trim);   // keystone
  if (spec.shutters) {
    for (const s of [-1, 1]) B.shell.add(at(box(0.32, oh - 0.08, 0.06, s * (ow / 2 + 0.2), 0, 0.03)), T.shutter);
  }
  if (opts.flowerBox) {
    FB.add(at(box(ow - 0.1, 0.22, 0.26, 0, -oh / 2 - 0.2, 0.15)), T.trim);
    for (let i = 0; i < 3; i++) FB.add(at(new THREE.IcosahedronGeometry(0.09, 0).translate(-ow / 3 + i * ow / 3, -oh / 2 - 0.02, 0.2)), [0xff6f91, 0xffb84d, 0xe961c2][i]);
  }
}

function balcony(B, T, F, cx, cz, u, v, ow) {
  const at = (geo) => orientFace(geo.translate(u, v, 0), cx, 0, cz, F);
  const w = ow + 0.9, dep = 0.85;
  B.shell.add(at(box(w, 0.12, dep, 0, -0.06, dep / 2)), T.trim);
  B.shell.add(at(box(w, 0.05, 0.05, 0, 0.95, dep - 0.03)), T.iron);
  for (const s of [-1, 1]) B.shell.add(at(box(0.05, 0.95, 0.05, s * (w / 2 - 0.03), 0.47, dep - 0.03)), T.iron);
  for (const s of [-1, 1]) B.shell.add(at(box(0.05, 0.95, 0.05, s * (w / 2 - 0.03), 0.47, 0.03)), T.iron);
  for (const s of [-1, 1]) B.shell.add(at(box(0.05, 0.05, dep, s * (w / 2 - 0.03), 0.95, dep / 2)), T.iron);
  if (B.detail) {
    const n = Math.floor(w / 0.22);
    for (let i = 1; i < n; i++) fine(B).add(at(baluster(0.9).translate(-w / 2 + i * (w / n), 0.45, dep - 0.03)), T.iron);
  }
}

// a railing bar as two crossed strips (4 triangles instead of a 12-triangle box)
function baluster(h, w = 0.04) {
  const a = new THREE.PlaneGeometry(w, h);
  const b = new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2);
  const geo = mergeAll([a, b]);
  return geo;
}

function fireEscape(B, T, F, cx, cz, u, floors, floorH, yBase) {
  const at = (geo) => orientFace(geo.translate(u, 0, 0), cx, 0, cz, F);
  for (let f = 1; f < floors; f++) {
    const y = yBase + f * floorH;
    B.shell.add(at(box(2.8, 0.08, 1.0, 0, y, 0.5)), T.iron);
    B.shell.add(at(box(2.8, 0.05, 0.05, 0, y + 0.95, 0.98)), T.iron);
    for (const s of [-1, 1]) B.shell.add(at(box(0.05, 0.95, 0.05, s * 1.38, y + 0.47, 0.98)), T.iron);
    if (B.detail) for (let i = 1; i < 8; i++) fine(B).add(at(baluster(0.9, 0.03).translate(-1.4 + i * 0.35, y + 0.45, 0.98)), T.iron);
    if (f < floors - 1) {
      // diagonal ladder up to the next platform (authored at origin, then tilted)
      const run = 0.9, hyp = Math.hypot(floorH, run);
      const stair = new THREE.BoxGeometry(0.55, 0.05, hyp).rotateX(-Math.atan2(floorH, run));
      stair.translate(-0.9, y + floorH / 2, 0.55);
      B.shell.add(at(stair), T.iron);
    }
  }
}

// Ground-floor shopfront on a face: full-width mullioned glass, a fascia with
// the atlas sign, awning, hanging sign, spotlights, and a glazed door.
function shopfront(B, T, F, cx, cz, span, signs, rng, opts = {}) {
  const at = (geo) => orientFace(geo, cx, 0, cz, F);
  const gw = span - 1.0, gh = 2.55, gy = 0.5 + gh / 2 + 0.25;
  // glazing set back in the reveal, one panel is the door
  const lit = rng() < 0.7;
  const bays = Math.max(2, Math.round(gw / 1.7));
  const bw = gw / bays;
  const doorBay = (rng() * bays) | 0;
  for (let b = 0; b < bays; b++) {
    const u = -gw / 2 + bw * (b + 0.5);
    if (b === doorBay) {
      B.shell.add(at(box(bw - 0.16, gh - 0.1, 0.06, u, gy - 0.05, -0.2)), T.door);
      B.paneDark.add(at(new THREE.PlaneGeometry(bw - 0.5, gh * 0.45).translate(u, gy + gh * 0.15, -0.16)), T.glass);
      B.shell.add(at(box(0.05, 0.05, 0.12, u + bw * 0.28, gy - 0.1, -0.12)), BRASS);          // handle
    } else {
      (lit ? B.paneLit : B.paneDark).add(at(new THREE.PlaneGeometry(bw - 0.12, gh - 0.16).translate(u, gy, -0.2)), lit ? 0xffe0b0 : T.glass);
      if (B.detail && rng() < 0.5) {                                                            // window display shelf + goods
        fine(B).add(at(box(bw - 0.3, 0.06, 0.4, u, gy - gh / 2 + 0.6, -0.42)), T.trim);
        for (let k = 0; k < 3; k++) fine(B).add(at(box(0.22, 0.3 + (k % 2) * 0.12, 0.22, u - bw / 3 + k * bw / 3, gy - gh / 2 + 0.8, -0.42)), [T.accent, 0xf4e5a3, T.line][k]);
      }
    }
    if (b > 0) B.shell.add(at(box(0.09, gh, 0.14, -gw / 2 + bw * b, gy, -0.1)), T.shopFrame);   // mullions
  }
  B.shell.add(at(box(gw + 0.2, 0.12, 0.16, 0, gy - gh / 2 - 0.02, -0.08)), T.shopFrame);        // stall riser cap
  B.shell.add(at(box(gw + 0.2, 0.12, 0.16, 0, gy + gh / 2 + 0.02, -0.08)), T.shopFrame);        // transom
  for (const s of [-1, 1]) B.shell.add(at(box(0.16, gh + 0.3, 0.2, s * (gw / 2 + 0.08), gy, -0.06)), T.shopFrame);   // pilasters
  // fascia board with the sign
  const fy = gy + gh / 2 + 0.5;
  B.shell.add(at(box(span - 0.4, 0.72, 0.18, 0, fy, 0.09)), T.fascia);
  const uv = signs?.fascia?.();
  if (uv) {
    const q = uvCell(new THREE.PlaneGeometry(Math.min(span - 0.7, 5.2), 0.62), uv.u0, uv.v0, uv.u1, uv.v1).translate(0, fy, 0.19);
    B.sign.add(at(q), 0xffffff);
  }
  if (B.detail) {
    for (let i = 0; i < 3; i++) {                                                                 // spotlights under the fascia
      const u = -span / 3 + i * span / 3;
      fine(B).add(at(cyl(0.04, 0.04, 0.3, 5, u, fy + 0.45, 0.3)), T.iron);
      B.neon.add(at(sphere(0.06, u, fy + 0.4, 0.42, 5, 4)), 0xffe0b0);
    }
    const awn = rng();
    if (awn < 0.55) awning(B, cx, gy + gh / 2 + 0.12, cz, F, { width: span - 1.1, depth: 1.1, color: T.awning, stripe: awn < 0.28 ? 0xf4f1ea : null });
    else if (awn < 0.8) {                                                                          // fixed canopy
      B.shell.add(at(box(span - 0.9, 0.08, 1.0, 0, gy + gh / 2 + 0.1, 0.5)), T.trim);
      B.neon.add(at(box(span - 1.3, 0.05, 0.05, 0, gy + gh / 2 + 0.04, 0.9)), T.lineHex);
    }
    // hanging sign at the pilaster
    const huv = signs?.hanging?.();
    if (huv) {
      const hu = span / 2 - 0.3;
      fine(B).add(at(box(0.05, 0.05, 1.0, hu, fy + 0.7, 0.5)), T.iron);
      fine(B).add(at(box(0.05, 0.5, 0.05, hu, fy + 0.45, 0.95)), T.iron);
      const plate = uvCell(new THREE.PlaneGeometry(0.9, 0.75).rotateY(Math.PI / 2), huv.u0, huv.v0, huv.u1, huv.v1).translate(hu + 0.02, fy - 0.15, 0.95);
      const back = uvCell(new THREE.PlaneGeometry(0.9, 0.75).rotateY(-Math.PI / 2), huv.u0, huv.v0, huv.u1, huv.v1).translate(hu - 0.02, fy - 0.15, 0.95);
      B.sign.add(at(plate), 0xffffff); B.sign.add(at(back), 0xffffff);
    }
  }
  // two broad steps up to the shop floor (the plinth is the stall riser)
  B.shell.add(at(box(gw + 0.4, 0.24, 0.7, 0, 0.12, 0.35)), T.stone);
  B.shell.add(at(box(gw + 0.2, 0.24, 0.4, 0, 0.36, 0.2)), T.stone);
}

function doorway(B, T, F, cx, cz, u, kind, rng) {
  const at = (geo) => orientFace(geo, cx, 0, cz, F);
  const dh = kind === 'georgian' ? 2.45 : 2.25, dw = 1.1;
  const dy = 0.5 + dh / 2;
  B.shell.add(at(box(dw - 0.1, dh - 0.08, 0.06, u, dy, -0.2)), T.door);
  if (B.detail) {
    fine(B).add(at(sphere(0.04, u + dw * 0.32, dy - 0.05, -0.15, 5, 4)), BRASS);
    for (let i = 0; i < 2; i++) fine(B).add(at(box(dw - 0.5, 0.04, 0.02, u, dy - 0.5 + i * 0.8, -0.16)), new THREE.Color(T.door).multiplyScalar(0.75));
  }
  if (kind === 'georgian' || kind === 'painted') {
    B.paneLit.add(at(new THREE.CircleGeometry(dw / 2 - 0.05, 6, 0, Math.PI).translate(u, dy + dh / 2 - 0.02, -0.18)), 0xffe0b0);   // fanlight
    if (B.detail) {
      for (const s of [-1, 1]) B.shell.add(at(cyl(0.11, 0.13, dh + 0.5, 8, u + s * (dw / 2 + 0.32), 0.5 + (dh + 0.5) / 2, 0.42)), T.column);
      B.shell.add(at(box(dw + 1.2, 0.28, 0.9, u, 0.5 + dh + 0.6, 0.3)), T.column);
      B.shell.add(at(box(dw + 1.4, 0.1, 1.0, u, 0.5 + dh + 0.8, 0.3)), T.trim);
    }
  } else if (kind === 'brick' || kind === 'shop') {
    B.shell.add(at(box(dw + 0.5, 0.22, 0.7, u, 0.5 + dh + 0.18, 0.3)), T.trim);
  }
  // steps
  B.shell.add(at(box(dw + 0.6, 0.18, 0.7, u, 0.09, 0.35)), T.stone);
  B.shell.add(at(box(dw + 0.4, 0.18, 0.42, u, 0.27, 0.21)), T.stone);
  B.shell.add(at(box(dw + 0.2, 0.16, 0.2, u, 0.44, 0.1)), T.stone);
  if (kind === 'georgian' && T.iron !== undefined && B.detail) {                             // railings each side of the steps
    for (const s of [-1, 1]) {
      fine(B).add(at(box(0.04, 0.9, 0.04, u + s * (dw / 2 + 0.45), 0.95, 0.65)), T.iron);
      fine(B).add(at(box(0.04, 0.04, 0.9, u + s * (dw / 2 + 0.45), 1.35, 0.3)), T.iron);
    }
  }
}

// ------------------------------------------------------------------ roofs
function flatRoof(B, T, x, z, w, d, yTop, rng, opts = {}) {
  B.shell.add(box(w - 0.1, 0.24, d - 0.1, x, yTop + 0.1, z), T.roofFlat);
  // parapet ring + coping
  const ph = 0.55;
  B.shell.add(box(w + 0.2, ph, THICK, x, yTop + ph / 2, z + d / 2 - THICK / 2 + 0.1), T.wall);
  B.shell.add(box(w + 0.2, ph, THICK, x, yTop + ph / 2, z - d / 2 + THICK / 2 - 0.1), T.wall);
  B.shell.add(box(THICK, ph, d + 0.2, x + w / 2 - THICK / 2 + 0.1, yTop + ph / 2, z), T.wall);
  B.shell.add(box(THICK, ph, d + 0.2, x - w / 2 + THICK / 2 - 0.1, yTop + ph / 2, z), T.wall);
  B.shell.add(box(w + 0.36, 0.1, d + 0.36, x, yTop + ph + 0.05, z), T.trim);
  if (!B.detail) return;
  const y = yTop + 0.22;
  const MB = mid(B);
  if (opts.tank || rng() < 0.4) {                                                            // water tank on legs
    const tx = x + (rng() - 0.5) * w * 0.4, tz = z + (rng() - 0.5) * d * 0.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) MB.add(box(0.1, 1.6, 0.1, tx + sx * 0.7, y + 0.8, tz + sz * 0.7), T.iron);
    MB.add(cyl(0.95, 0.95, 1.7, 10, tx, y + 2.4, tz), WOOD);
    MB.add(cone(1.02, 0.5, 10, tx, y + 3.5, tz), T.iron);
    for (let i = 0; i < 2; i++) fine(B).add(new THREE.CylinderGeometry(0.99, 0.99, 0.06, 10, 1, true).translate(tx, y + 1.9 + i * 0.9, tz), T.iron);
  }
  const acN = 1 + ((rng() * 2) | 0);
  for (let i = 0; i < acN; i++) {                                                           // AC units
    const ax = x + (rng() - 0.5) * w * 0.6, az = z + (rng() - 0.5) * d * 0.6;
    MB.add(box(1.0, 0.8, 0.9, ax, y + 0.4, az), 0xbfc7d2);
    fine(B).add(cyl(0.3, 0.3, 0.06, 10, ax, y + 0.82, az), 0x2a3346);
  }
  if (rng() < 0.6) {                                                                       // aerial
    const ax = x + (rng() - 0.5) * w * 0.5, az = z + (rng() - 0.5) * d * 0.5;
    fine(B).add(cyl(0.02, 0.03, 2.6, 4, ax, y + 1.3, az), T.iron);
    for (let i = 0; i < 3; i++) fine(B).add(box(0.9 - i * 0.2, 0.025, 0.025, ax, y + 1.6 + i * 0.45, az), T.iron);
  }
  if (rng() < 0.5) MB.add(box(1.6, 1.1, 1.4, x + (rng() - 0.5) * w * 0.3, y + 0.55, z + (rng() - 0.5) * d * 0.3), T.wall);   // stair hut
}

function pitchedRoof(B, T, x, z, w, d, yTop, rng, { rise = 1.9, chimneys = 1, colour = null, thatch = false } = {}) {
  const alongX = w >= d;
  const span = alongX ? d : w, len = alongX ? w : d;
  const ov = 0.35;
  const profile = [[-span / 2 - ov, 0], [span / 2 + ov, 0], [0, rise]];
  const roof = prism(profile, len + 0.5, x, yTop - 0.05, z, alongX ? Math.PI / 2 : 0);
  B.shell.add(roof, colour || T.roof);
  if (thatch) {                                                                              // thatch bulk over the ridge
    B.shell.add(prism([[-span / 2 - 0.15, rise * 0.55], [span / 2 + 0.15, rise * 0.55], [0, rise + 0.3]], len + 0.3, x, yTop - 0.05, z, alongX ? Math.PI / 2 : 0), T.roof);
  }
  // gable boards
  B.shell.add(box(w + 0.7, 0.16, d + 0.7, x, yTop + 0.02, z), T.trim);
  if (!B.detail) return;
  for (let c = 0; c < chimneys; c++) {
    const along = (c ? -1 : 1) * len * 0.3;
    const cx = alongX ? x + along : x + (rng() - 0.5) * span * 0.3;
    const cz = alongX ? z + (rng() - 0.5) * span * 0.3 : z + along;
    const cy = yTop + rise * 0.9;
    B.shell.add(box(0.7, 1.4, 0.55, cx, cy + 0.5, cz), T.chimney);
    B.shell.add(box(0.8, 0.12, 0.65, cx, cy + 1.2, cz), T.trim);
    for (const s of [-1, 1]) fine(B).add(cyl(0.1, 0.12, 0.45, 5, cx + s * 0.18, cy + 1.45, cz), 0xb8695a);
  }
}

function mansardRoof(B, T, x, z, w, d, yTop, rng, floorLit) {
  const h = 2.4, inset = 0.9;
  const alongX = w >= d;
  const span = alongX ? d : w, len = alongX ? w : d;
  const profile = [[-span / 2 - 0.3, 0], [span / 2 + 0.3, 0], [span / 2 - inset, h], [-span / 2 + inset, h]];
  B.shell.add(prism(profile, len + 0.6, x, yTop, z, alongX ? Math.PI / 2 : 0), T.slate);
  // end caps of the mansard (the prism caps are the gables here, fine)
  B.shell.add(box(w - inset * 2 + 0.4, 0.2, d - inset * 2 + 0.4, x, yTop + h + 0.08, z), T.trim);
  if (!B.detail) return;
  // dormers on the long sides
  const n = Math.max(1, Math.floor(len / 3.2));
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const along = -len / 2 + len / (n + 1) * (i + 1);
    const out = span / 2 - inset * 0.35;
    const dx = alongX ? x + along : x + s * out;
    const dz = alongX ? z + s * out : z + along;
    const ry = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
    B.shell.add(box(1.1, 1.3, 0.9, 0, 0, 0).rotateY(ry).translate(dx, yTop + 1.0, dz), T.wall);
    B.shell.add(prism([[-0.65, 0], [0.65, 0], [0, 0.5]], 1.0, 0, 0, 0, Math.PI / 2).rotateY(ry).translate(dx, yTop + 1.65, dz), T.slate);
    const pane = new THREE.PlaneGeometry(0.7, 0.9).rotateY(ry);
    const fx = alongX ? 0 : s * 0.46, fz = alongX ? s * 0.46 : 0;
    (floorLit ? B.paneLit : B.paneDark).add(pane.translate(dx + fx, yTop + 1.0, dz + fz), floorLit ? 0xffd9a0 : T.glass);
  }
}

function sawtoothRoof(B, T, x, z, w, d, yTop, rng) {
  // teeth repeat along x; each profile lies in XY and extrudes the depth d
  const n = 3, tooth = w / n, rise = 1.3;
  for (let i = 0; i < n; i++) {
    const tx = x - w / 2 + tooth * (i + 0.5);
    const profile = [[-tooth / 2, 0], [tooth / 2, 0], [tooth / 2 - 0.25, rise]];
    B.shell.add(prism(profile, d + 0.4, tx, yTop, z, 0), T.roof);
    // glazed steep face (normal +x)
    const glass = new THREE.PlaneGeometry(d - 0.6, rise * 0.9).rotateY(Math.PI / 2).translate(tx + tooth / 2 - 0.1, yTop + rise * 0.5, z);
    B.paneLit.add(glass, 0xffe0b0);
  }
  if (B.detail) {
    const sx = x + w * 0.3, sz = z + d * 0.15;
    B.shell.add(cyl(0.34, 0.48, 4.2, 8, sx, yTop + 2.1, sz), T.chimney);
    B.shell.add(new THREE.TorusGeometry(0.4, 0.05, 4, 10).rotateX(Math.PI / 2).translate(sx, yTop + 3.9, sz), T.iron);
  }
}

function pagodaTiers(B, T, x, z, w, d, levels, floorH, yBase) {
  for (let l = 1; l <= levels; l++) {
    const y = yBase + l * floorH - 0.2;
    const r = Math.max(w, d) * 0.86 - (l - 1) * 0.5;
    const tier = new THREE.ConeGeometry(r, 1.1, 4, 1).rotateY(Math.PI / 4).translate(x, y + 0.55, z);
    B.shell.add(tier, T.roof);
    for (let c = 0; c < 4; c++) {
      const a = c * Math.PI / 2 + Math.PI / 4;
      B.shell.add(sphere(0.16, x + Math.cos(a) * r * 0.66, y + 0.3, z + Math.sin(a) * r * 0.66, 5, 4), BRASS);
    }
  }
}

// ------------------------------------------------------------- the facade
// slot: { x, z, w, d, frontage, front: F } ; T: tone table ; signs: atlas ctx.
// Returns the collider footprint(s) in the same local frame.
export function buildFacade(B, slot, kind, rng, T, signs, flags = {}, opts = {}) {
  const { x, z, w, d, frontage } = slot;
  const [minH, maxH] = HEIGHTS[kind] || HEIGHTS.brick;
  const lowRise = flags.lowRise && kind !== 'tower';
  let h = opts.height || (minH + rng() * (maxH - minH));
  if (lowRise && !opts.height) h *= 0.8;
  const floorH = FLOOR_H[kind] || 3.0;
  const floors = Math.max(1, Math.round((h - 0.5) / floorH));
  h = 0.5 + floors * floorH;
  const spec = WIN[kind] || WIN.brick;
  const front = slot.front;
  const wallTone = T.wall;
  const colliders = [{ localX: x, localZ: z, hw: w / 2 + 0.25, hd: d / 2 + 0.25 }];

  // plinth
  B.shell.add(box(w + 0.2, 0.5, d + 0.2, x, 0.25, z), T.stone);

  if (kind === 'tower') {
    curtainWall(B, T, x, z, w, d, h, floors, floorH, rng);
    return colliders;
  }

  const isShop = kind === 'shop' || (frontage && (kind === 'georgian' || kind === 'brick' || kind === 'painted' || kind === 'mansard') && rng() < 0.55);
  const verandaKind = kind === 'veranda';
  const doorU = (rng() - 0.5) * (Math.min(w, d) * 0.3);

  for (const F of FACES) {
    const { cx, cz, span } = faceCentre(x, z, w, d, F);
    const isFront = F === front;
    const holes = [];
    const wallH = h - 0.5;
    const slabSpan = F.nx ? span - THICK * 2 : span;
    const cols = Math.max(1, Math.floor((slabSpan - spec.w - 0.5) / spec.pitch));
    const total = cols * spec.pitch;
    const dressing = [];
    for (let f = 0; f < floors; f++) {
      const v = f * floorH + floorH * 0.56;
      const groundFloor = f === 0;
      if (groundFloor && isFront && isShop) continue;                   // shopfront takes the whole ground floor
      for (let c = 0; c < cols; c++) {
        const u = -total / 2 + spec.pitch * (c + 0.5);
        if (groundFloor && isFront && Math.abs(u - doorU) < spec.w / 2 + 0.75) continue;
        if (groundFloor && kind === 'adobe' && rng() < 0.4) continue;
        const ow = spec.w, oh = spec.h;
        holes.push({ u, v, w: ow, h: oh, arch: !!spec.arch });
        dressing.push({ u, v, ow, oh });
      }
    }
    if (isFront && isShop) {
      holes.push({ u: 0, v: 0.25 + 2.55 / 2 + 0.05, w: span - 1.0, h: 2.65 });
    } else if (isFront) {
      const dh = kind === 'georgian' ? 2.45 : 2.25;
      const fan = kind === 'georgian' || kind === 'painted';
      holes.push({ u: doorU, v: 0.06 + (dh + (fan ? 0.55 : 0)) / 2, w: 1.1, h: dh + (fan ? 0.55 : 0), arch: fan });
    }
    const slab = wallWithOpenings(slabSpan, wallH, THICK, holes);
    const g = orientFace(slab, cx, 0.5, cz, F);
    const tint = new THREE.Color(wallTone).offsetHSL(0, 0, (rng() - 0.5) * 0.03);
    B.shell.add(g, tint);
    jitterColor(g, kind === 'brick' ? 0.07 : 0.045, 1.3);
    if (kind === 'brick' || kind === 'georgian') {
      for (let f = 0; f < floors; f++) bandColor(g, 0.5 + f * floorH, 0.5 + f * floorH + 0.3, 0.9);   // floor band shade
    }
    // openings
    const litRoll = () => rng() < (flags.litRatio ?? 0.34);
    for (const o of dressing) {
      dressWindow(B, T, F, cx, cz, o.u, o.v + 0.5, o.ow, o.oh, spec, litRoll(), { flowerBox: flags.flowerBoxes && rng() < 0.25 && B.detail });
    }
    if (isFront && isShop) shopfront(B, T, F, cx, cz, span, signs, rng);
    else if (isFront) doorway(B, T, F, cx, cz, doorU, kind, rng);
    // string courses / floor lines
    if ((kind === 'georgian' || kind === 'brick' || kind === 'mansard') && B.detail) {
      for (let f = 1; f < floors; f++) {
        const yb = 0.5 + f * floorH - 0.08;
        B.shell.add(orientFace(new THREE.BoxGeometry(span + 0.1, 0.14, 0.12).translate(0, yb, 0.06), cx, 0, cz, F), T.band);
      }
    }
    // balconies on the frontage upper floors
    if (isFront && B.detail && (kind === 'brick' || kind === 'georgian' || kind === 'painted') && floors > 2 && rng() < 0.6) {
      const o = dressing.find((dd) => dd.v > floorH && dd.v < floorH * 2);
      if (o) balcony(B, T, F, cx, cz, o.u, o.v + 0.5 - o.oh / 2 - 0.02, o.ow);
    }
    // fire escape on brick blocks (side street face)
    if (kind === 'brick' && flags.fireEscapes && !isFront && F.nz === 1 && floors > 2 && B.detail) {
      fireEscape(B, T, F, cx, cz, span * 0.15, floors, floorH, 0.5);
    }
    // drainpipes at the face corners
    if (B.detail && (kind === 'brick' || kind === 'georgian' || kind === 'painted' || kind === 'mansard') && (isFront || F.nz === 1)) {
      const s = isFront ? -1 : 1;
      fine(B).add(orientFace(cyl(0.05, 0.05, wallH - 0.4, 5, s * (span / 2 - 0.25), 0.5 + (wallH - 0.4) / 2, 0.08), cx, 0, cz, F), T.iron);
      fine(B).add(orientFace(box(0.22, 0.24, 0.18, s * (span / 2 - 0.25), 0.5 + wallH - 0.3, 0.1), cx, 0, cz, F), T.iron);
    }
    // quoins on georgian corners
    if (B.detail && kind === 'georgian' && F.nx && frontage) {
      for (let q = 0; q < Math.floor(wallH / 0.6); q += 2) {
        for (const s of [-1, 1]) fine(B).add(orientFace(box(0.34, 0.3, 0.06, s * (slabSpan / 2 - 0.17), 0.5 + 0.15 + q * 0.6, 0.03), cx, 0, cz, F), T.trim);
      }
    }
    // mural on a blank side wall
    if (flags.murals && !isFront && F.nx && rng() < 0.3 && B.detail) {
      const mw = Math.min(span * 0.7, 5), mh = Math.min(wallH * 0.5, 6);
      B.shell.add(orientFace(new THREE.PlaneGeometry(mw, mh).translate(0, 0.5 + wallH * 0.55, 0.012), cx, 0, cz, F), T.accent);
      B.shell.add(orientFace(new THREE.CircleGeometry(mh * 0.28, 10).translate(-mw * 0.15, 0.5 + wallH * 0.6, 0.02), cx, 0, cz, F), T.line);
      B.shell.add(orientFace(new THREE.PlaneGeometry(mw * 0.5, mh * 0.12).translate(mw * 0.15, 0.5 + wallH * 0.4, 0.02), cx, 0, cz, F), 0xf4f1ea);
    }
  }

  // veranda: posts + rail + sloped roof around the front (and sides when wide)
  if (verandaKind && front) {
    const { cx, cz, span } = faceCentre(x, z, w, d, front);
    const at = (geo) => orientFace(geo, cx, 0, cz, front);
    const depth = 1.7, postN = Math.max(2, Math.round(span / 2.4)) + 1;
    B.shell.add(at(box(span + 0.6, 0.18, depth + 0.3, 0, 0.42, depth / 2 + 0.1)), T.deck);
    B.shell.add(at(prism([[0, 0], [depth + 0.5, -0.55], [depth + 0.5, -0.47], [0, 0.1]], span + 0.8, 0, 0, 0, -Math.PI / 2).translate(0, 0.5 + floorH + 0.1, 0)), flags.tin ? T.tin : T.roof);
    for (let i = 0; i < postN; i++) {
      const u = -span / 2 - 0.1 + i * (span + 0.2) / (postN - 1);
      B.shell.add(at(box(0.14, floorH, 0.14, u, 0.5 + floorH / 2, depth + 0.1)), T.column);
      if (B.detail && flags.ironwork) fine(B).add(at(box(0.5, 0.5, 0.06, u, 0.5 + floorH - 0.3, depth + 0.1)), T.iron);   // fretwork bracket
      if (i < postN - 1 && Math.abs(u + (span + 0.2) / (postN - 1) / 2 - doorU) > 1.0) {
        const pitch = (span + 0.2) / (postN - 1);
        B.shell.add(at(box(pitch - 0.14, 0.06, 0.06, u + pitch / 2, 1.45, depth + 0.1)), T.column);
        if (B.detail) for (let k = 1; k < Math.floor(pitch / 0.3); k++) fine(B).add(at(baluster(0.85, 0.045).translate(u + k * 0.3, 1.0, depth + 0.1)), T.column);
      }
    }
    // posts are thin and players walk under the veranda roof, so the building
    // footprint stays the only collider here
  }

  // roof by archetype
  const yTop = h;
  const cornice = () => {
    B.shell.add(box(w + 0.34, 0.2, d + 0.34, x, yTop - 0.1, z), T.trim);
    if (B.detail) B.shell.add(box(w + 0.5, 0.12, d + 0.5, x, yTop + 0.02, z), T.trim);
  };
  switch (kind) {
    case 'georgian': cornice(); if (rng() < 0.55) pitchedRoof(B, T, x, z, w, d, yTop + 0.05, rng, { rise: 1.6, chimneys: 2, colour: T.slate }); else flatRoof(B, T, x, z, w, d, yTop, rng); break;
    case 'brick': cornice(); flatRoof(B, T, x, z, w, d, yTop, rng, { tank: rng() < 0.6 }); break;
    case 'shop': cornice(); flatRoof(B, T, x, z, w, d, yTop, rng); break;
    case 'industrial': sawtoothRoof(B, T, x, z, w, d, yTop, rng); break;
    case 'veranda': pitchedRoof(B, T, x, z, w, d, yTop, rng, { rise: Math.min(w, d) * 0.32, chimneys: flags.thatch ? 1 : 0, colour: flags.tin ? T.tin : T.roof, thatch: flags.thatch }); break;
    case 'adobe': {
      B.shell.add(box(w + 0.1, 0.5, d + 0.1, x, yTop + 0.25, z), T.wall);        // rounded parapet feel
      B.shell.add(box(w - 0.4, 0.16, d - 0.4, x, yTop + 0.1, z), T.roofFlat);
      if (B.detail) for (let i = 0; i < Math.floor(w / 1.2); i++) B.shell.add(cyl(0.1, 0.1, 0.9, 5, x - w / 2 + 0.6 + i * 1.2, yTop - 0.3, z + d / 2 + 0.1).rotateX(Math.PI / 2).translate(0, 0, 0), WOOD);   // vigas
      break;
    }
    case 'pagoda': pagodaTiers(B, T, x, z, w, d, Math.min(floors, 3), floorH, 0.5); B.shell.add(cone(Math.max(w, d) * 0.55, 1.6, 4).rotateY(Math.PI / 4).translate(x, yTop + 0.8, z), T.roof); break;
    case 'mansard': cornice(); mansardRoof(B, T, x, z, w, d, yTop, rng, rng() < 0.4); break;
    case 'painted': cornice(); if (rng() < 0.5) flatRoof(B, T, x, z, w, d, yTop, rng); else pitchedRoof(B, T, x, z, w, d, yTop + 0.05, rng, { rise: 1.4, chimneys: 1 }); break;
    default: cornice(); flatRoof(B, T, x, z, w, d, yTop, rng);
  }
  // bunting between the frontage buildings is the district's job (needs neighbours)
  return colliders;
}

// Curtain-wall tower: glass bands + spandrels, mullions, setback, crown.
function curtainWall(B, T, x, z, w, d, h, floors, floorH, rng) {
  const lowerFloors = Math.max(3, Math.round(floors * 0.62));
  const emit = (fx, fz, fw, fd, f0, f1) => {
    for (let f = f0; f < f1; f++) {
      const y0 = 0.5 + f * floorH;
      B.shell.add(box(fw, 1.2, fd, fx, y0 + 0.6, fz), T.spandrel);                        // spandrel band
      for (const F of FACES) {
        const span = F.nx ? fd : fw;
        const ext = (F.nx ? fw : fd) / 2;
        const lit = rng() < 0.4;
        const pane = new THREE.PlaneGeometry(span - 0.1, floorH - 1.2 - 0.06).translate(0, 0, 0);
        (lit ? B.paneLit : B.paneDark).add(orientFace(pane, fx + F.nx * (ext - 0.12), y0 + 1.2 + (floorH - 1.2) / 2, fz + F.nz * (ext - 0.12), F), lit ? 0xd8f0ff : T.glassTower);
        if (B.detail) {
          const n = Math.max(2, Math.floor(span / 1.6));
          for (let m = 0; m <= n; m++) {
            const u = -span / 2 + m * (span / n);
            fine(B).add(orientFace(box(0.08, floorH - 1.2, 0.12, u, y0 + 1.2 + (floorH - 1.2) / 2, -0.06), fx + F.nx * ext, 0, fz + F.nz * ext, F), T.mullion);
          }
        }
      }
      // corner piers
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.shell.add(box(0.3, floorH, 0.3, fx + sx * (fw / 2 - 0.15), y0 + floorH / 2, fz + sz * (fd / 2 - 0.15)), T.spandrel);
    }
  };
  emit(x, z, w, d, 0, lowerFloors);
  const yMid = 0.5 + lowerFloors * floorH;
  B.shell.add(box(w + 0.3, 0.3, d + 0.3, x, yMid + 0.1, z), T.trim);
  const wTop = w - 1.6, dTop = d - 1.6;
  emit(x, z, wTop, dTop, lowerFloors, floors);
  const yTop = 0.5 + floors * floorH;
  B.shell.add(box(wTop + 0.3, 0.35, dTop + 0.3, x, yTop + 0.15, z), T.trim);
  B.shell.add(box(wTop - 0.3, 0.3, dTop - 0.3, x, yTop + 0.3, z), T.roofFlat);
  B.shell.add(box(wTop * 0.5, 1.4, dTop * 0.5, x, yTop + 1.0, z), T.spandrel);               // plant room
  B.shell.add(cyl(0.06, 0.1, 5, 6, x, yTop + 3.9, z), T.iron);                                // mast
  B.neon.add(sphere(0.18, x, yTop + 6.5, z, 6, 4), 0xff5a5a);
  B.neon.add(box(0.14, 1.4 * 0.9, 0.14, x, yTop + 1.0, z + dTop * 0.5 / 2 + 0.08), T.lineHex);
  if (B.detail) {                                                                             // ground-floor lobby canopy
    B.shell.add(box(w * 0.5, 0.14, 1.4, x, 3.4, z + d / 2 + 0.7), T.trim);
    B.neon.add(box(w * 0.46, 0.05, 0.05, x, 3.32, z + d / 2 + 1.3), 0xffe0b0);
  }
  if (B.detail && rng() < 0.6) {                                                              // rooftop billboard
    const bw = Math.min(6, wTop * 0.8);
    for (const s of [-1, 1]) B.shell.add(box(0.1, 2.2, 0.1, x + s * bw / 2, yTop + 1.6, z - dTop / 2 + 0.2), T.iron);
    B.neon.add(box(bw, 1.6, 0.08, x, yTop + 2.3, z - dTop / 2 + 0.2), T.lineHex);
  }
}

// Tone table from the district palette. Kept in one place so every archetype
// derives its trims, glass, iron and stone from the same four authored colours.
export function toneTable({ cPrimary, cSecondary, cAccent, cLine, cRoof }, flags, rng) {
  const CREAM = new THREE.Color(0xe7e3dc);
  const ink = new THREE.Color(0x0a1024);
  const wallTones = [
    cPrimary.clone().lerp(CREAM, 0.10),
    cSecondary.clone(),
    cPrimary.clone().lerp(cSecondary, 0.55).offsetHSL(0, 0.03, -0.07),
    cSecondary.clone().lerp(cAccent, 0.26).offsetHSL(0, 0, 0.05),
  ];
  const trim = cPrimary.clone().multiplyScalar(0.62).lerp(ink, 0.35);
  const stone = CREAM.clone().lerp(trim, 0.3);
  return {
    wallTones, trim, band: stone.clone().lerp(cPrimary, 0.2), stone: stone.clone().multiplyScalar(0.9),
    roof: cRoof.clone().lerp(CREAM, 0.12), roofFlat: cRoof.clone().lerp(ink, 0.35), slate: new THREE.Color(0x3a3f52).lerp(cRoof, 0.2),
    tin: new THREE.Color(0xb8c1c8).lerp(cRoof, 0.25), chimney: cSecondary.clone().lerp(ink, 0.4),
    frame: flags.bright ? CREAM.clone() : CREAM.clone().lerp(cPrimary, 0.15),
    glass: new THREE.Color(0x0a1424).lerp(cLine, 0.06), glassTower: new THREE.Color(0x0f2038).lerp(cLine, 0.12),
    iron: new THREE.Color(0x1f2536), column: CREAM.clone(), shutter: cAccent.clone().lerp(ink, 0.2),
    door: cAccent.clone(), shopFrame: cRoof.clone().lerp(ink, 0.55), fascia: ink.clone().lerp(cAccent, 0.2),
    awning: cAccent.clone(), accent: cAccent.clone(), line: cLine.clone(), lineHex: cLine.getHex(),
    spandrel: cPrimary.clone().lerp(ink, 0.45), mullion: new THREE.Color(0xb9c3cf), deck: new THREE.Color(0x8a5a3a),
  };
}

// Per-building tone view: picks a wall tone and door colour with the district's flags.
export function buildingTones(T, index, rng, flags) {
  const bright = [0xe86a5e, 0xf2b33d, 0x4fa3a5, 0x9b7fd0, 0x67c26f, 0xf0a0c0, 0x5cbcff, 0xffb45f];
  const wall = flags.bright
    ? new THREE.Color(bright[(index + ((rng() * 3) | 0)) % bright.length]).lerp(new THREE.Color(0xf4f1ea), 0.18)
    : T.wallTones[index % T.wallTones.length].clone();
  const door = flags.bright || rng() < 0.5
    ? new THREE.Color(bright[(index * 3 + 1) % bright.length])
    : T.door.clone();
  return { ...T, wall, door };
}
