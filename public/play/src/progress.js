// One store for everything the player has earned: XP, per-circuit rounds,
// street exercises overheard, grammar mastery + the Leitner review queue,
// district stamps, line certificates, rank, daily streak.
//
// Persistence is localStorage namespaced by student id (from the
// em-student-session the signup wall already validated), so two students on
// one laptop stop sharing a save. The legacy flat keys (em_xp, em_progress,
// em_grammar) are migrated on first load and kept as mirrors on every save so
// a rollback to the old build never loses a session. Every read and write is
// guarded: a corrupt value falls back to a fresh save and reports it, instead
// of throwing at module top level and bricking the boot (the 2026-09-04 review
// found exactly that failure in zones.js).
//
// `remote` is a pluggable { load(studentId) -> state|null, save(studentId,
// state) } interface. It is a no-op stub here; the Convex worldProgress
// functions and the leaderboard are wave 2 and will slot in without touching
// callers.
const SAVE_PREFIX = 'em_save:';
const LEGACY = { xp: 'em_xp', progress: 'em_progress', grammar: 'em_grammar' };
const SCHEMA = 2;

// Leitner boxes: a missed item comes back after 10 minutes, then a day, then
// four days, then a fortnight; a fourth first-try hit retires it.
export const LEITNER_MS = [10 * 60e3, 24 * 3600e3, 4 * 24 * 3600e3, 14 * 24 * 3600e3];
export const MASTERY_WINDOW = 20;   // first-try accuracy is judged over the last N items

function safeParse(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : fallback; }
  catch { return fallback; }
}
function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }

export function studentIdFromSession() {
  const s = safeParse(lsGet('em-student-session'), null);
  if (!s) return 'guest';
  if (s.slug) return String(s.slug);
  if (s.email) return String(s.email).toLowerCase();
  if (s.sessionToken) return 'tok-' + String(s.sessionToken).slice(0, 12);
  return 'guest';
}

const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function freshState() {
  return {
    v: SCHEMA, xp: 0,
    circuits: {},        // code -> { laps, d:{npcIdx:true}, w:{npcIdx:true}, street:{slot:true}, stamped: ts|0 }
    grammar: {},         // concept -> { seen, correct, done:[ids], recent:[0|1...], wrong:{id:{n,box,due}} }
    certificates: {},    // lineKey -> ts
    cityComplete: 0,     // ts
    streak: { last: '', days: 0 },
    rankSeen: 0,         // highest rank index the player has been shown a ceremony for
    stats: { drills: 0, firstTry: 0, answered: 0 },
    updatedAt: 0,
  };
}

// Old em_progress shapes: { code: {laps, d, w, street:n} } or the pre-round
// flat { code: {idx:true, _bonused} }.
function migrateCircuits(old) {
  const out = {};
  for (const [code, p] of Object.entries(old || {})) {
    if (!p || typeof p !== 'object') continue;
    if ('d' in p) {
      out[code] = { laps: p.laps | 0, d: { ...(p.d || {}) }, w: { ...(p.w || {}) }, street: {}, stamped: p.laps >= 1 ? 1 : 0 };
    } else {
      const d = {};
      for (const k of Object.keys(p)) if (k !== '_bonused') d[k] = true;
      out[code] = p._bonused ? { laps: 1, d: {}, w: {}, street: {}, stamped: 1 } : { laps: 0, d, w: {}, street: {}, stamped: 0 };
    }
  }
  return out;
}

export class Progress {
  constructor({ remote = null, studentId = null } = {}) {
    this.remote = remote || { load: async () => null, save: async () => {} };
    this.studentId = studentId || studentIdFromSession();
    this.key = SAVE_PREFIX + this.studentId;
    this.listeners = new Set();
    this._saveTimer = null;
    this.warnings = [];
    this.state = this._load();
  }

  _load() {
    const raw = lsGet(this.key);
    if (raw != null) {
      const s = safeParse(raw, null);
      if (s && s.v >= 1) return { ...freshState(), ...s, streak: { ...freshState().streak, ...(s.streak || {}) }, stats: { ...freshState().stats, ...(s.stats || {}) } };
      this.warnings.push(`progress_corrupt:${raw.length}`);
      console.warn('[EM] progress save was corrupt, starting fresh (kept legacy keys)');
    }
    // first run under this id: lift the legacy flat keys
    const s = freshState();
    s.xp = Number(lsGet(LEGACY.xp)) || 0;
    s.circuits = migrateCircuits(safeParse(lsGet(LEGACY.progress), {}));
    const g = safeParse(lsGet(LEGACY.grammar), {});
    for (const [concept, m] of Object.entries(g)) {
      if (!m || typeof m !== 'object') continue;
      s.grammar[concept] = { seen: m.seen | 0, correct: m.correct | 0, done: Array.isArray(m.done) ? m.done.slice() : [], recent: [], wrong: {} };
    }
    // stamps for circuits already past round 1
    for (const [code, c] of Object.entries(s.circuits)) if (c.laps >= 1 && !c.stamped) c.stamped = 1;
    return s;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(what) { for (const fn of this.listeners) { try { fn(what, this.state); } catch (e) { console.warn('[EM] progress listener', e); } } }

  // Debounced write; the mirrors keep the pre-store keys readable.
  save(immediate = false) {
    clearTimeout(this._saveTimer);
    const write = () => {
      this._saveTimer = null;
      this.state.updatedAt = Date.now();
      const ok = lsSet(this.key, JSON.stringify(this.state));
      if (!ok && !this._quotaWarned) { this._quotaWarned = true; this.warnings.push('progress_write_failed'); this._emit('write-failed'); }
      lsSet(LEGACY.xp, String(this.state.xp));
      const legacyProgress = {};
      for (const [code, c] of Object.entries(this.state.circuits)) legacyProgress[code] = { laps: c.laps, d: c.d, w: c.w, street: Object.keys(c.street || {}).length };
      lsSet(LEGACY.progress, JSON.stringify(legacyProgress));
      const legacyGrammar = {};
      for (const [k, m] of Object.entries(this.state.grammar)) legacyGrammar[k] = { seen: m.seen, correct: m.correct, done: m.done };
      lsSet(LEGACY.grammar, JSON.stringify(legacyGrammar));
      Promise.resolve(this.remote.save(this.studentId, this.state)).catch((e) => console.warn('[EM] remote save', e));
    };
    if (immediate) write(); else this._saveTimer = setTimeout(write, 400);
  }
  flush() { if (this._saveTimer) this.save(true); }

  // ---------- xp / streak ----------
  get xp() { return this.state.xp; }
  addXP(n) {
    n = Math.max(0, n | 0);
    if (!n) return this.state.xp;
    this.state.xp += n;
    this._touchStreak();
    this.save();
    this._emit('xp');
    return this.state.xp;
  }
  _touchStreak() {
    const t = todayKey();
    const st = this.state.streak;
    if (st.last === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    st.days = st.last === todayKey(y) ? (st.days | 0) + 1 : 1;
    st.last = t;
  }
  // consecutive play days; 0 once a whole day has been skipped
  get streak() {
    const st = this.state.streak;
    const y = new Date(); y.setDate(y.getDate() - 1);
    return st.last === todayKey() || st.last === todayKey(y) ? st.days | 0 : 0;
  }

  // ---------- circuits (districts + hub) ----------
  circuit(code) {
    return this.state.circuits[code] || (this.state.circuits[code] = { laps: 0, d: {}, w: {}, street: {}, stamped: 0 });
  }
  peekCircuit(code) { return this.state.circuits[code] || { laps: 0, d: {}, w: {}, street: {}, stamped: 0 }; }
  stampedCount(codes) { return codes.filter((c) => this.peekCircuit(c).stamped).length; }

  // ---------- grammar mastery + Leitner ----------
  concept(id) {
    return this.state.grammar[id] || (this.state.grammar[id] = { seen: 0, correct: 0, done: [], recent: [], wrong: {} });
  }
  // firstTry: was this the first click on the item this session; wasCorrect: that click was right.
  // Only first clicks count toward mastery. Any wrong first click enters the review queue.
  recordAnswer(conceptId, exId, wasCorrect, { firstTry = true, review = false } = {}) {
    const c = this.concept(conceptId);
    if (!firstTry) return;
    c.seen++;
    c.recent = [...(c.recent || []), wasCorrect ? 1 : 0].slice(-MASTERY_WINDOW);
    this.state.stats.answered++;
    if (wasCorrect) {
      c.correct++;
      this.state.stats.firstTry++;
      if (!c.done.includes(exId)) c.done.push(exId);
      const w = c.wrong?.[exId];
      if (w) {
        w.box = (w.box | 0) + 1;
        if (w.box >= LEITNER_MS.length) delete c.wrong[exId];
        else w.due = Date.now() + LEITNER_MS[w.box];
      }
    } else {
      c.wrong ||= {};
      const w = c.wrong[exId] || (c.wrong[exId] = { n: 0, box: 0, due: 0 });
      w.n++; w.box = 0; w.due = Date.now() + LEITNER_MS[0];
    }
    this.save();
    this._emit(review ? 'review' : 'answer');
  }
  masteryFor(conceptId) {
    const c = this.state.grammar[conceptId] || { seen: 0, correct: 0, done: [], recent: [], wrong: {} };
    const recent = c.recent || [];
    const recentPct = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length * 100) : 0;
    const badge = recent.length >= 5 && recentPct >= 95 && recent.length >= 15 ? 'gold'
      : recent.length >= 5 && recentPct >= 80 ? 'silver'
        : recent.length >= 5 && recentPct >= 60 ? 'bronze' : null;
    return {
      seen: c.seen, correct: c.correct, doneUnique: (c.done || []).length,
      pct: c.seen ? Math.round(c.correct / c.seen * 100) : 0,
      recentN: recent.length, recentPct, badge, dueCount: this.dueIds(conceptId).length,
    };
  }
  // ids whose review is due, soonest first. concept=null → every concept.
  dueIds(conceptId = null, now = Date.now()) {
    const out = [];
    for (const [cid, c] of Object.entries(this.state.grammar)) {
      if (conceptId && cid !== conceptId) continue;
      for (const [id, w] of Object.entries(c.wrong || {})) if (w.due <= now) out.push({ id, concept: cid, due: w.due, n: w.n });
    }
    return out.sort((a, b) => a.due - b.due);
  }
  reviewQueueSize() { let n = 0; for (const c of Object.values(this.state.grammar)) n += Object.keys(c.wrong || {}).length; return n; }
}

// Singleton: every module that needs the save reads this one instance, so the
// bootstrap never has to thread it through constructors.
export const progress = new Progress();
export function setRemote(remote) { progress.remote = remote; }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => progress.flush());
  window.addEventListener('beforeunload', () => progress.flush());
}
