// The rank ladder XP climbs. Thresholds are sized so that an honest full round
// of the city (44 districts × ~3 drills + stamps + line certificates) lands the
// player around Cosmopolitan; the first rank-up arrives after the hub circuit
// plus one district so the ceremony is met in the first session.
export const RANKS = [
  { name: 'Newcomer', xp: 0, glyph: '🧳' },
  { name: 'Commuter', xp: 250, glyph: '🎫' },
  { name: 'Regular', xp: 700, glyph: '☕' },
  { name: 'Local', xp: 1500, glyph: '🏘️' },
  { name: 'Old Hand', xp: 3000, glyph: '🗝️' },
  { name: 'Cosmopolitan', xp: 6000, glyph: '🌍' },
];

// { index, name, glyph, floor, next (xp of next rank or null), frac (0..1 toward next) }
export function rankFor(xp) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) index = i;
  const r = RANKS[index];
  const nextRank = RANKS[index + 1] || null;
  const frac = nextRank ? Math.min(1, (xp - r.xp) / (nextRank.xp - r.xp)) : 1;
  return { index, name: r.name, glyph: r.glyph, floor: r.xp, next: nextRank ? nextRank.xp : null, nextName: nextRank?.name || null, frac };
}

// Render the rank chip beside #xp: glyph + name and a progress ring toward the
// next rank. `el` owns an <svg> ring and a label; created once, updated cheaply.
const RING_R = 11, RING_C = 2 * Math.PI * RING_R;
export function renderRankChip(el, xp) {
  if (!el) return;
  const r = rankFor(xp);
  if (!el.dataset.built) {
    el.dataset.built = '1';
    el.innerHTML = `<svg class="ring" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <circle cx="14" cy="14" r="${RING_R}" class="track"/>
        <circle cx="14" cy="14" r="${RING_R}" class="fill" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/>
      </svg><span class="glyph"></span><span class="name"></span>`;
  }
  el.querySelector('.glyph').textContent = r.glyph;
  el.querySelector('.name').textContent = r.name;
  el.querySelector('.fill').style.strokeDashoffset = (RING_C * (1 - r.frac)).toFixed(2);
  el.title = r.next ? `${r.name} · ${xp} / ${r.next} XP to ${r.nextName}` : `${r.name} · top rank`;
  return r;
}
