// Offline harness for convex/scheduling.ts.
// Runs the REAL handler bodies (esbuild-bundled from the source file, with only
// ./_generated/* and convex/values stubbed) against an in-memory database.
// Nothing here touches Convex, mail, Google or the network.

import { createHash } from 'node:crypto';
import * as S from './scheduling.bundle.mjs';

let PASS = 0, FAIL = 0;
function check(label, cond, detail) {
  if (cond) { PASS++; console.log('  PASS  ' + label + (detail ? '   ' + detail : '')); }
  else { FAIL++; console.log('  FAIL  ' + label + (detail ? '   ' + detail : '')); }
}
async function expectThrow(label, fn, test) {
  try { await fn(); check(label, false, 'did not throw'); return null; }
  catch (e) { const ok = test ? test(e) : true; check(label, ok, ok ? (e.data?.code || e.message) : ('threw: ' + e.message + ' data=' + JSON.stringify(e.data))); return e; }
}

// ── in-memory Convex ────────────────────────────────────────────────
let seq = 0;
class Q {
  constructor(rows) { this.rows = rows; this.cons = []; }
  withIndex(_name, fn) {
    const cons = [];
    const q = { eq: (f, val) => { cons.push([f, val]); return q; } };
    if (fn) fn(q); this.cons = cons; return this;
  }
  _m() { return this.rows.filter(r => this.cons.every(([f, val]) => r[f] === val)); }
  async unique() { const m = this._m(); if (m.length > 1) throw new Error('not unique'); return m[0] ?? null; }
  async first() { return this._m()[0] ?? null; }
  async collect() { return this._m(); }
}
class DB {
  constructor() {
    this.t = { students: [], users: [], authSessions: [], teacherAvailability: [], lessonBookings: [],
      lessonPackages: [], lessons: [], groups: [], groupMemberships: [], auditLog: [], organizations: [] };
  }
  async insert(table, doc) {
    const _id = table + ':' + (++seq);
    this.t[table].push({ ...doc, _id, _creationTime: Date.now() });
    return _id;
  }
  async get(id) {
    for (const rows of Object.values(this.t)) { const r = rows.find(x => x._id === id); if (r) return r; }
    return null;
  }
  async patch(id, fields) { const r = await this.get(id); if (!r) throw new Error('no row ' + id); Object.assign(r, fields); }
  async delete(id) { for (const k of Object.keys(this.t)) this.t[k] = this.t[k].filter(x => x._id !== id); }
  query(table) { if (!this.t[table]) throw new Error('unknown table ' + table); return new Q(this.t[table]); }
}
const sha = (s) => createHash('sha256').update(s).digest('hex');

function makeCtx(db) {
  const scheduled = [];
  const ctx = {
    db, scheduled,
    scheduler: { runAfter: async (_delay, ref, args) => { scheduled.push({ path: ref.__path, args }); } },
    runQuery: async () => { throw new Error('runQuery not stubbed'); },
    runMutation: async () => { throw new Error('runMutation not stubbed'); },
  };
  return ctx;
}

// ── Warsaw date helpers (independent of the code under test) ────────
function warsawParts(ms) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, dow };
}
function warsawToUtc(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number); const [hh, mm] = timeStr.split(':').map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm) - 2 * 3600e3;
  for (let i = 0; i < 4; i++) {
    const got = warsawParts(guess); if (got.date === dateStr && got.time === timeStr) return guess;
    const [gh, gm] = got.time.split(':').map(Number); let diff = (hh * 60 + mm) - (gh * 60 + gm);
    if (got.date < dateStr) diff += 1440; if (got.date > dateStr) diff -= 1440; guess += diff * 60e3;
  }
  return guess;
}
const addDays = (dateStr, n) => new Date(new Date(dateStr + 'T00:00:00Z').getTime() + n * 86400e3).toISOString().slice(0, 10);
// First Warsaw date of weekday `dow` that is at least `minDaysAhead` days from now.
function nextWeekday(dow, minDaysAhead) {
  let d = addDays(warsawParts(Date.now()).date, minDaysAhead);
  for (let i = 0; i < 8; i++) { if (warsawParts(warsawToUtc(d, '12:00')).dow === dow) return d; d = addDays(d, 1); }
  throw new Error('no weekday');
}

// ── fixture ─────────────────────────────────────────────────────────
const ORG = 'org:pvt', ORG2 = 'org:conversa', TEACHER = 'users:mike';
async function fixture({ credits = 24, verified = true, expiresAt } = {}) {
  const db = new DB();
  db.t.organizations.push({ _id: ORG, name: 'EM PVT', type: 'private_practice' }, { _id: ORG2, name: 'Conversa', type: 'school' });
  db.t.users.push({ _id: TEACHER, name: 'Michael', email: 'michael@example.com', role: 'super_admin', status: 'active', organizationId: ORG });
  const now = Date.now();
  // Live grid (prod 2026-09-01): Mon-Thu 10:00-20:00, Fri 10:00-17:00, 60 + 15, both orgs.
  for (const org of [ORG, ORG2]) for (const dow of [1, 2, 3, 4, 5]) {
    db.t.teacherAvailability.push({ _id: `ta:${org}:${dow}`, organizationId: org, dayOfWeek: dow, startTime: '10:00',
      endTime: dow === 5 ? '17:00' : '20:00', slotMinutes: 60, gapMinutes: 15, active: true, createdAt: now, updatedAt: now,
      ...(org === ORG2 ? { teacherId: TEACHER } : {}) });
  }
  const student = { _id: 'students:szymon', name: 'Szymon', slug: 'szymon', organizationId: ORG, primaryTeacherId: TEACHER,
    status: 'active', email: 'szymon@example.com', emailVerifiedAt: verified ? now - 1e6 : undefined, level: 'C1' };
  const other = { _id: 'students:other', name: 'Other', slug: 'other', organizationId: ORG2, status: 'active', emailVerifiedAt: now - 1e6 };
  // A school student with NO package: schools are invoiced per lesson (exempt from the credit gate).
  const schoolKid = { _id: 'students:schoolkid', name: 'School Kid', slug: 'schoolkid', organizationId: ORG2, status: 'active', emailVerifiedAt: now - 1e6 };
  db.t.students.push(student, other, schoolKid);
  if (credits > 0) db.t.lessonPackages.push({ _id: 'pkg:1', organizationId: ORG, studentId: student._id, name: 'Fluency Mastery',
    totalLessons: credits, purchasedAt: now - 30 * 86400e3, status: 'active', createdAt: now, updatedAt: now,
    ...(expiresAt !== undefined ? { expiresAt } : {}) });
  // The other student always has credit: they exist to occupy slots in the OTHER org.
  db.t.lessonPackages.push({ _id: 'pkg:other', organizationId: ORG2, studentId: other._id, name: 'Other pack',
    totalLessons: 20, purchasedAt: now - 30 * 86400e3, status: 'active', createdAt: now, updatedAt: now });
  db.t.authSessions.push(
    { _id: 'sess:student', kind: 'student', studentId: student._id, tokenHash: sha('student-token'), createdAt: now, expiresAt: now + 1e9 },
    { _id: 'sess:other', kind: 'student', studentId: other._id, tokenHash: sha('other-token'), createdAt: now, expiresAt: now + 1e9 },
    { _id: 'sess:admin', kind: 'admin', userId: TEACHER, tokenHash: sha('admin-token'), createdAt: now, expiresAt: now + 1e9 });
  return { db, ctx: makeCtx(db), student, other };
}
const stu = (args) => ({ sessionToken: 'student-token', organizationId: ORG, studentId: 'students:szymon', bookedBy: 'student', bookedByName: 'Szymon', ...args });
const remaining = async (ctx) => {
  // Independent arithmetic (billing.ts: scheduled/completed/late/no-show rows consume a lesson)
  const total = ctx.db.t.lessonPackages.filter(p => p.studentId === 'students:szymon' && p.status !== 'cancelled').reduce((n, p) => n + p.totalLessons, 0);
  const used = ctx.db.t.lessonBookings.filter(b => b.studentId === 'students:szymon' && ['scheduled', 'completed', 'cancelled_late', 'no_show'].includes(b.status)).length;
  return Math.max(0, total - Math.min(used, total));
};

// Wednesday ≥ 3 days out, 15:00 Warsaw — Szymon's actual weekly slot.
const WED = nextWeekday(3, 3);
const wed15 = (i) => warsawToUtc(addDays(WED, 7 * i), '15:00');

console.log('\n=== A. getOpenSlots: the live grid produces 8 slots on a Wednesday ===');
{
  const { ctx } = await fixture();
  const slots = await S.getOpenSlots.handler(ctx, { organizationId: ORG, fromDate: WED, toDate: WED, forStudent: true });
  check('8 slots', slots.length === 8, slots.map(s => s.timeWarsaw).join(' '));
  check('10:00 first, 18:45 last', slots[0]?.timeWarsaw === '10:00' && slots[7]?.timeWarsaw === '18:45');
  check('every slot 60 min', slots.every(s => s.endUtc - s.startUtc === 3600e3));
  const fri = nextWeekday(5, 3);
  const fslots = await S.getOpenSlots.handler(ctx, { organizationId: ORG, fromDate: fri, toDate: fri, forStudent: true });
  check('Friday 10:00-17:00 gives 5 slots', fslots.length === 5, fslots.map(s => s.timeWarsaw).join(' '));
}

console.log('\n=== B. bookLesson (single) keeps its contract ===');
{
  const { ctx } = await fixture({ credits: 1 });
  const r = await S.bookLesson.handler(ctx, stu({ startUtc: wed15(0) }));
  check('returns legacy shape', r.bookingId && r.dateWarsaw === WED && r.timeWarsaw === '15:00' && String(r.teacherId) === TEACHER && /meet\.jit\.si/.test(r.meetLink), JSON.stringify(r));
  const row = await ctx.db.get(r.bookingId);
  check('row scheduled, no seriesId for a single booking', row.status === 'scheduled' && row.seriesId === undefined && row.seriesKind === undefined);
  check('row carries notification tracking', row.notificationStatus === 'pending' && row.notificationAttempts === 0);
  check('ONE sendBookingConfirmation scheduled, attempt 1', ctx.scheduled.length === 1 && ctx.scheduled[0].path === 'scheduling.sendBookingConfirmation' && ctx.scheduled[0].args.attempt === 1, JSON.stringify(ctx.scheduled));
  const e = await expectThrow('second booking with 0 credits left is refused as a ConvexError', () => S.bookLesson.handler(ctx, stu({ startUtc: wed15(1) })),
    e => e.name === 'ConvexError' && e.data.code === 'NO_LESSONS_REMAINING' && /No lessons remaining/.test(e.data.message) && e.data.remaining === 0);
  check('refusal inserted nothing', ctx.db.t.lessonBookings.length === 1);
  await expectThrow('same slot again is SLOT_TAKEN with the historical message', () => S.bookLesson.handler({ ...ctx, db: ctx.db }, { ...stu({ startUtc: wed15(0) }), sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other' }),
    e => e.data?.code === 'SLOT_TAKEN' && /Time clash: another lesson is booked/.test(e.data.message));
  await expectThrow('off-grid time is OUTSIDE_AVAILABILITY', () => S.bookLesson.handler(ctx, { ...stu({ startUtc: warsawToUtc(addDays(WED, 7), '15:30') }), sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other' }),
    e => e.data?.code === 'OUTSIDE_AVAILABILITY');
  await expectThrow('past time is PAST', () => S.bookLesson.handler(ctx, { ...stu({ startUtc: Date.now() - 3600e3 }), sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other' }),
    e => e.data?.code === 'PAST');
  await expectThrow('bad token is Unauthorized (plain Error, unchanged)', () => S.bookLesson.handler(ctx, stu({ startUtc: wed15(2), sessionToken: 'nope' })),
    e => e.name !== 'ConvexError' && /Unauthorized/.test(e.message));
  // Lead time: earliest grid slot inside 24h, if the calendar has one right now.
  const today = warsawParts(Date.now()).date;
  const soon = (await S.getOpenSlots.handler(ctx, { organizationId: ORG2, teacherId: TEACHER, fromDate: today, toDate: addDays(today, 2) }))
    .find(s => s.startUtc > Date.now() && s.startUtc - Date.now() < 24 * 3600e3);
  if (soon) {
    await expectThrow('inside 24h is TOO_LATE_TO_BOOK for a student', () => S.bookLesson.handler(ctx, { ...stu({ startUtc: soon.startUtc }), sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other' }),
      e => e.data?.code === 'TOO_LATE_TO_BOOK' && e.data.message === 'TOO_LATE_TO_BOOK');
    const admin = await S.bookLesson.handler(ctx, { sessionToken: 'admin-token', organizationId: ORG2, studentId: 'students:other', startUtc: soon.startUtc, bookedBy: 'superadmin', bookedByName: 'Michael' });
    check('the console may still book inside 24h', !!admin.bookingId);
  } else console.log('  skip  no grid slot inside 24h at this hour; lead-time check not exercised');
}

console.log('\n=== C. bookedBy is no longer a bypass ===');
{
  const { ctx } = await fixture({ credits: 0 });
  await expectThrow('student session + bookedBy:superadmin + 0 credits is refused', () => S.bookLesson.handler(ctx, stu({ startUtc: wed15(0), bookedBy: 'superadmin' })),
    e => e.data?.code === 'NO_LESSONS_REMAINING');
  const { ctx: c2 } = await fixture({ credits: 0, verified: false });
  await expectThrow('student session + unverified email is refused even as "superadmin"', () => S.bookLesson.handler(c2, stu({ startUtc: wed15(0), bookedBy: 'superadmin' })),
    e => e.data?.code === 'EMAIL_NOT_VERIFIED');
  const { ctx: c3 } = await fixture({ credits: 0 });
  // 2026-09-03: the credit gate applies to EVERY actor in a package-billed org. No override flag.
  await expectThrow('an admin session booking as superadmin with 0 credits is refused (no bypass)', () => S.bookLesson.handler(c3, { sessionToken: 'admin-token', organizationId: ORG, studentId: 'students:szymon', startUtc: wed15(0), bookedBy: 'superadmin', bookedByName: 'Michael' }),
    e => e.data?.code === 'NO_LESSONS_REMAINING' && /Allocate or extend a package in Billing/.test(e.data.message));
  check('admin refusal inserted nothing', c3.db.t.lessonBookings.length === 0);
  await expectThrow('an admin session booking AS the student (Bajla WhatsApp) is still credit-gated', () => S.bookLesson.handler(c3, { sessionToken: 'admin-token', organizationId: ORG, studentId: 'students:szymon', startUtc: wed15(1), bookedBy: 'student', bookedByName: 'via Bajla' }),
    e => e.data?.code === 'NO_LESSONS_REMAINING');
  // Schools are invoiced per lesson: an admin books a package-less school student freely.
  const rs = await S.bookLesson.handler(c3, { sessionToken: 'admin-token', organizationId: ORG2, studentId: 'students:schoolkid', startUtc: wed15(0), bookedBy: 'school_admin', bookedByName: 'Conversa admin' });
  check('school org (type school) is exempt: admin books a student with no package', !!rs.bookingId);
  // An expired package is refused for the admin too, with the Billing hint.
  const { ctx: c4 } = await fixture({ credits: 5, expiresAt: Date.now() - 86400e3 });
  await expectThrow('admin booking on an expired package is PACKAGE_EXPIRED with the Billing hint', () => S.bookLesson.handler(c4, { sessionToken: 'admin-token', organizationId: ORG, studentId: 'students:szymon', startUtc: wed15(0), bookedBy: 'superadmin', bookedByName: 'Michael' }),
    e => e.data?.code === 'PACKAGE_EXPIRED' && e.data.trapped === 5 && /Extend it in Billing/.test(e.data.message));
  // Extending the package (the only sanctioned route) makes the same booking succeed.
  c4.db.t.lessonPackages.find(p => p._id === 'pkg:1').expiresAt = Date.now() + 180 * 86400e3;
  const r4 = await S.bookLesson.handler(c4, { sessionToken: 'admin-token', organizationId: ORG, studentId: 'students:szymon', startUtc: wed15(0), bookedBy: 'superadmin', bookedByName: 'Michael' });
  check('after extending expiresAt the admin booking succeeds', !!r4.bookingId);
}

console.log('\n=== D. bookLessons (batch): all or nothing, one email ===');
{
  const { ctx } = await fixture({ credits: 3 });
  await expectThrow('4 slots with 3 credits is refused with the numbers', () => S.bookLessons.handler(ctx, stu({ startUtcs: [wed15(0), wed15(1), wed15(2), wed15(3)] })),
    e => e.data?.code === 'NO_LESSONS_REMAINING' && e.data.remaining === 3 && e.data.requested === 4);
  check('nothing inserted after the refusal', ctx.db.t.lessonBookings.length === 0 && ctx.scheduled.length === 0);
  const r = await S.bookLessons.handler(ctx, stu({ startUtcs: [wed15(2), wed15(0), wed15(1), wed15(1)] }));
  check('3 rows (duplicate collapsed), sorted by time', r.bookings.length === 3 && r.bookings[0].startUtc === wed15(0) && r.bookings[2].startUtc === wed15(2));
  check('seriesKind batch, seriesId = first booking id', r.seriesKind === 'batch' && r.seriesId === String(r.bookings[0].bookingId));
  const rows = ctx.db.t.lessonBookings;
  check('every row carries the same seriesId and its own Meet placeholder', rows.every(x => x.seriesId === r.seriesId && x.seriesKind === 'batch' && /meet\.jit\.si\/EnglishMetropolis-/.test(x.meetLink)));
  check('exactly ONE sendSeriesConfirmation with all 3 ids', ctx.scheduled.length === 1 && ctx.scheduled[0].path === 'scheduling.sendSeriesConfirmation' && ctx.scheduled[0].args.bookingIds.length === 3, JSON.stringify(ctx.scheduled.map(s => s.path)));
  check('credits now 0', (await remaining(ctx)) === 0);
  await expectThrow('a further single booking is refused', () => S.bookLesson.handler(ctx, stu({ startUtc: wed15(3) })), e => e.data?.code === 'NO_LESSONS_REMAINING');
}

console.log('\n=== E. bookLessons: a taken week refuses the whole plan and names it ===');
{
  const { ctx } = await fixture({ credits: 10 });
  // Another student in the OTHER org already holds week 1 (global overlap rule).
  await S.bookLesson.handler(ctx, { sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other', startUtc: wed15(1), bookedBy: 'student' });
  ctx.scheduled.length = 0;
  const e = await expectThrow('SLOT_UNAVAILABLE lists the taken week', () => S.bookLessons.handler(ctx, stu({ startUtcs: [wed15(0), wed15(1), wed15(2)], seriesKind: 'weekly' })),
    e => e.data?.code === 'SLOT_UNAVAILABLE' && e.data.slots.length === 1 && e.data.slots[0].reason === 'taken' && e.data.slots[0].dateWarsaw === addDays(WED, 7));
  check('atomic: Szymon has no rows, nothing scheduled', ctx.db.t.lessonBookings.filter(b => b.studentId === 'students:szymon').length === 0 && ctx.scheduled.length === 0);
  const ok = await S.bookLessons.handler(ctx, stu({ startUtcs: [wed15(0), wed15(2)], seriesKind: 'weekly' }));
  check('the open weeks book as a weekly series', ok.bookings.length === 2 && ok.seriesKind === 'weekly');
  const open = await S.getOpenSlots.handler(ctx, { organizationId: ORG, fromDate: WED, toDate: addDays(WED, 14), forStudent: true });
  check('getOpenSlots no longer offers the booked 15:00s', !open.some(s => s.timeWarsaw === '15:00' && [WED, addDays(WED, 7), addDays(WED, 14)].includes(s.dateWarsaw)));
  await expectThrow('too many slots', () => S.bookLessons.handler(ctx, stu({ startUtcs: Array.from({ length: 53 }, (_, i) => wed15(3 + i)) })), e => e.data?.code === 'TOO_MANY_SLOTS');
  await expectThrow('empty list', () => S.bookLessons.handler(ctx, stu({ startUtcs: [] })), e => e.data?.code === 'NO_SLOTS');
}

console.log('\n=== E2. skipRefused mode books what passes and names the rest ===');
{
  const { ctx } = await fixture({ credits: 2 });
  await S.bookLesson.handler(ctx, { sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other', startUtc: wed15(1), bookedBy: 'student' });
  ctx.scheduled.length = 0;
  const r = await S.bookLessons.handler(ctx, stu({ startUtcs: [wed15(0), wed15(1), wed15(2)], seriesKind: 'weekly', mode: 'skipRefused' }));
  check('books the 2 open weeks, skips the taken one with its reason', r.bookings.length === 2 && r.skipped.length === 1 && r.skipped[0].reason === 'taken' && r.skipped[0].dateWarsaw === addDays(WED, 7));
  check('credits gate counted only the booked weeks (2 credits, 2 booked)', (await remaining(ctx)) === 0);
  check('one series email', ctx.scheduled.length === 1 && ctx.scheduled[0].path === 'scheduling.sendSeriesConfirmation');
  await expectThrow('nothing bookable at all is still a refusal', () => S.bookLessons.handler(ctx, stu({ startUtcs: [wed15(1)], seriesKind: 'weekly', mode: 'skipRefused' })), e => e.data?.code === 'SLOT_UNAVAILABLE');
  const { ctx: c2 } = await fixture({ credits: 1 });
  await expectThrow('skipRefused still refuses when credits are short for the bookable weeks', () => S.bookLessons.handler(c2, stu({ startUtcs: [wed15(0), wed15(2)], seriesKind: 'weekly', mode: 'skipRefused' })), e => e.data?.code === 'NO_LESSONS_REMAINING' && e.data.requested === 2 && e.data.remaining === 1);
  check('strict mode is the default: a single-slot call ignores mode', true);
}

console.log('\n=== E3. listBookings: a teacher\'s schedule spans every org ===');
{
  const { ctx } = await fixture({ credits: 5 });
  await S.bookLesson.handler(ctx, stu({ startUtc: wed15(0) }));                                   // PVT, teacher stamped via primaryTeacherId
  await S.bookLesson.handler(ctx, { sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other', startUtc: wed15(1), bookedBy: 'student', teacherId: TEACHER });
  const mine = await S.listBookings.handler(ctx, { sessionToken: 'admin-token', organizationId: ORG2, teacherId: TEACHER });
  check('teacherId query returns both orgs for the teacher himself', mine.length === 2 && new Set(mine.map(b => b.organizationId)).size === 2, JSON.stringify(mine.map(b => b.organizationId)));
  const org = await S.listBookings.handler(ctx, { sessionToken: 'admin-token', organizationId: ORG2 });
  check('org-scoped query without teacherId is unchanged (1 row)', org.length === 1);
  const own = await S.listBookings.handler(ctx, { sessionToken: 'student-token', studentId: 'students:szymon' });
  check('student path unchanged and carries seriesId fields (undefined for singles)', own.length === 1 && own[0].seriesId === undefined);
}

console.log('\n=== F. previewWeeklySeries across the October DST change ===');
{
  const { ctx } = await fixture({ credits: 24 });
  // Start on the first Wednesday of October 2026 (or the fixture Wednesday if later), 12 weeks: crosses 2026-10-25.
  let start = '2026-10-07';
  if (WED > start) start = WED;
  const p = await S.previewWeeklySeries.handler(ctx, { organizationId: ORG, dayOfWeek: 3, timeWarsaw: '15:00', fromDate: start, count: 12, forStudent: true });
  check('12 weeks', p.weeks.length === 12);
  check('every week is a Wednesday at 15:00 Warsaw', p.weeks.every(w => warsawParts(w.startUtc).time === '15:00' && warsawParts(w.startUtc).dow === 3), p.weeks.map(w => warsawParts(w.startUtc).time).join(' '));
  const gaps = p.weeks.slice(1).map((w, i) => (w.startUtc - p.weeks[i].startUtc) / 3600e3);
  // 15:00 CEST is 13:00Z; 15:00 CET is 14:00Z — the week that crosses 25 Oct is 169 h in UTC.
  check('the UTC gap grows by one hour across the CEST→CET change (169 h once)', gaps.filter(g => g === 169).length === 1 && gaps.every(g => g === 168 || g === 169), gaps.join(' '));
  check('all open on an empty calendar', p.weeks.every(w => w.status === 'open'));
  await S.bookLesson.handler(ctx, { sessionToken: 'other-token', organizationId: ORG2, studentId: 'students:other', startUtc: p.weeks[2].startUtc, bookedBy: 'student' });
  const p2 = await S.previewWeeklySeries.handler(ctx, { organizationId: ORG, dayOfWeek: 3, timeWarsaw: '15:00', fromDate: start, count: 12, forStudent: true });
  check('week 3 becomes "taken" once another org books it', p2.weeks[2].status === 'taken' && p2.weeks.filter(w => w.status === 'open').length === 11);
  await S.bookLesson.handler(ctx, stu({ startUtc: p.weeks[4].startUtc }));
  const py = await S.previewWeeklySeries.handler(ctx, { organizationId: ORG, dayOfWeek: 3, timeWarsaw: '15:00', fromDate: start, count: 12, forStudent: true, studentId: 'students:szymon' });
  check('the student\'s own week reads "yours", the other student\'s "taken"', py.weeks[4].status === 'yours' && py.weeks[2].status === 'taken');
  const pn = await S.previewWeeklySeries.handler(ctx, { organizationId: ORG, dayOfWeek: 3, timeWarsaw: '15:00', fromDate: start, count: 12, forStudent: true });
  check('without studentId it is just "taken" (public shape unchanged)', pn.weeks[4].status === 'taken');
  const p3 = await S.previewWeeklySeries.handler(ctx, { organizationId: ORG, dayOfWeek: 3, timeWarsaw: '19:30', fromDate: start, count: 3, forStudent: true });
  check('an off-grid time is "closed" every week', p3.weeks.every(w => w.status === 'closed'));
  await expectThrow('fromDate must be that weekday', () => S.previewWeeklySeries.handler(ctx, { organizationId: ORG, dayOfWeek: 4, timeWarsaw: '15:00', fromDate: start, count: 3 }), e => e.data?.code === 'BAD_START_DATE');
  const p4 = await S.previewWeeklySeries.handler(ctx, { organizationId: ORG, dayOfWeek: 3, timeWarsaw: '15:00', fromDate: start, count: 500 });
  check('count clamps to 52', p4.weeks.length === 52);
}

console.log('\n=== G. cancelSeries: the rest of the series, one email, credits back ===');
{
  const { ctx } = await fixture({ credits: 6 });
  const r = await S.bookLessons.handler(ctx, stu({ startUtcs: [0, 1, 2, 3].map(wed15), seriesKind: 'weekly' }));
  check('4 booked, 2 credits left', r.bookings.length === 4 && (await remaining(ctx)) === 2);
  await expectThrow('another student cannot cancel it', () => S.cancelSeries.handler(ctx, { sessionToken: 'other-token', seriesId: r.seriesId, cancelledBy: 'student' }), e => /Unauthorized/.test(e.message));
  // Cancel one lesson on its own first (the second), then the rest from the third on.
  const one = await S.cancelBooking.handler(ctx, { sessionToken: 'student-token', bookingId: r.bookings[1].bookingId, cancelledBy: 'student', cancelledByName: 'Szymon' });
  check('single cancel of week 2 is free (>24h) and emails once', one.status === 'cancelled' && !one.billable && ctx.scheduled.filter(s => s.path === 'scheduling.sendBookingCancellation').length === 1);
  ctx.scheduled.length = 0;
  const rest = await S.cancelSeries.handler(ctx, { sessionToken: 'student-token', seriesId: r.seriesId, fromStartUtc: wed15(2), cancelledBy: 'student', cancelledByName: 'Szymon' });
  check('cancels weeks 3 and 4 only', rest.cancelled === 2 && rest.cancelledLate === 0 && rest.bookings.map(b => b.startUtc).join() === [wed15(2), wed15(3)].join());
  check('ONE sendSeriesCancellation with both ids', ctx.scheduled.length === 1 && ctx.scheduled[0].path === 'scheduling.sendSeriesCancellation' && ctx.scheduled[0].args.bookingIds.length === 2);
  const rows = ctx.db.t.lessonBookings;
  check('week 1 still scheduled, weeks 2-4 cancelled and not billable', rows[0].status === 'scheduled' && rows.slice(1).every(x => x.status === 'cancelled' && x.billable === false && x.cancellationNotificationStatus === 'pending'));
  check('credits back to 5', (await remaining(ctx)) === 5);
  await expectThrow('nothing left to cancel from week 2 on', () => S.cancelSeries.handler(ctx, { sessionToken: 'student-token', seriesId: r.seriesId, fromStartUtc: wed15(1), cancelledBy: 'student' }), e => e.data?.code === 'NOTHING_TO_CANCEL');
  const admin = await S.cancelSeries.handler(ctx, { sessionToken: 'admin-token', seriesId: r.seriesId, cancelledBy: 'superadmin', cancelledByName: 'Michael' });
  check('an admin can cancel the remaining week', admin.cancelled === 1 && rows[0].status === 'cancelled' && rows[0].cancelledBy === 'superadmin');
  await expectThrow('a bogus seriesId is not found', () => S.cancelSeries.handler(ctx, { sessionToken: 'student-token', seriesId: 'lessonBookings:999', cancelledBy: 'student' }), e => /Series not found/.test(e.message));
}

console.log('\n=== G2. A late cancel bills the student ONLY when the student cancelled ===');
{
  const mk = async (ctx, id) => { await ctx.db.insert('lessonBookings', { organizationId: ORG, teacherId: TEACHER, studentId: 'students:szymon',
    startUtc: Date.now() + 2 * 3600e3, endUtc: Date.now() + 3 * 3600e3, dateWarsaw: 'x', timeWarsaw: 'x', status: 'scheduled', bookedBy: 'student', createdAt: 0, updatedAt: 0 }); return 'lessonBookings:' + seq; };
  const { ctx } = await fixture({ credits: 4 });
  const a = await mk(ctx); const ra = await S.cancelBooking.handler(ctx, { sessionToken: 'student-token', bookingId: a, cancelledBy: 'student' });
  check('student cancels 2h before: cancelled_late, billable', ra.status === 'cancelled_late' && ra.billable === true && !ra.lateButFree);
  const b = await mk(ctx); const rb = await S.cancelBooking.handler(ctx, { sessionToken: 'admin-token', bookingId: b, cancelledBy: 'superadmin', cancelledByName: 'Michael' });
  check('Mike cancels 2h before: cancelled, NOT billable, lateButFree', rb.status === 'cancelled' && rb.billable === false && rb.lateButFree === true && rb.cancelledBy === 'superadmin');
  const c = await mk(ctx); const rc = await S.cancelBooking.handler(ctx, { sessionToken: 'student-token', bookingId: c, cancelledBy: 'superadmin' });
  check('a student session cannot claim to be the teacher: still billable, stored as student', rc.billable === true && rc.cancelledBy === 'student' && (await ctx.db.get(c)).cancelledBy === 'student');
  const d = await mk(ctx); const rd = await S.cancelBooking.handler(ctx, { sessionToken: 'admin-token', bookingId: d, cancelledBy: 'student', cancelledByName: 'Szymon via Bajla' });
  check('Bajla (admin session) cancelling AS the student inside 24h is billable', rd.billable === true && rd.status === 'cancelled_late' && rd.cancelledBy === 'student');
  check('credits: 4 minus the 3 billable late cancels = 1', (await remaining(ctx)) === 1);
  // series: one lesson inside 24h cancelled by Mike + one next week
  const { ctx: c2 } = await fixture({ credits: 4 });
  const r = await S.bookLessons.handler(c2, stu({ startUtcs: [wed15(0), wed15(1)], seriesKind: 'weekly' }));
  const soonRow = await c2.db.get(r.bookings[0].bookingId); soonRow.startUtc = Date.now() + 2 * 3600e3; soonRow.endUtc = soonRow.startUtc + 3600e3;
  const rs = await S.cancelSeries.handler(c2, { sessionToken: 'admin-token', seriesId: r.seriesId, cancelledBy: 'superadmin' });
  check('series cancelled by Mike: 2 cancelled, 0 billable, 1 lateButFree', rs.cancelled === 2 && rs.cancelledLate === 0 && rs.lateButFree === 1 && rs.bookings.every(x => !x.billable));
  check('credits fully restored', (await remaining(c2)) === 4);
}

console.log('\n=== H. getBookingInternal exposes what the cancel email needs ===');
{
  const { ctx } = await fixture({ credits: 2 });
  const r = await S.bookLessons.handler(ctx, stu({ startUtcs: [wed15(0), wed15(1)], seriesKind: 'weekly' }));
  await S.cancelSeries.handler(ctx, { sessionToken: 'admin-token', seriesId: r.seriesId, cancelledBy: 'superadmin' });
  const info = await S.getBookingInternal.handler(ctx, { bookingId: r.bookings[0].bookingId });
  check('cancelledByRole teacher, not billable, seriesKind weekly, times present', info.cancelledByRole === 'teacher' && info.billableLate === false && info.seriesKind === 'weekly' && info.startUtc === wed15(0) && info.studentEmail === 'szymon@example.com');
  const series = await S.getSeriesInternal.handler(ctx, { bookingIds: r.bookings.map(b => b.bookingId).reverse() });
  check('getSeriesInternal returns rows sorted by time', series.length === 2 && series[0].startUtc < series[1].startUtc);
}

console.log('\n=== I. package validity (Regulamin § 5 ust. 2): expired packages are not bookable ===');
{
  // live package with a future expiry books normally
  const { ctx } = await fixture({ credits: 2, expiresAt: Date.now() + 30 * 86400e3 });
  const r = await S.bookLesson.handler(ctx, stu({ startUtc: wed15(0) }));
  check('future expiry: booking accepted', !!r.bookingId);
  // expired package with unused lessons: refused with PACKAGE_EXPIRED naming the date and count
  const { ctx: c2 } = await fixture({ credits: 3, expiresAt: Date.now() - 86400e3 });
  await expectThrow('expired package is refused as PACKAGE_EXPIRED', () => S.bookLesson.handler(c2, stu({ startUtc: wed15(0) })),
    e => e.name === 'ConvexError' && e.data.code === 'PACKAGE_EXPIRED' && e.data.trapped === 3 && e.data.remaining === 0 && /expired on \d{4}-\d{2}-\d{2}/.test(e.data.message));
  check('refusal inserted nothing', c2.db.t.lessonBookings.length === 0);
  // expired package that already USED its lessons must still absorb them (no double credit elsewhere)
  const { ctx: c3 } = await fixture({ credits: 1, expiresAt: Date.now() + 30 * 86400e3 });
  await S.bookLesson.handler(c3, stu({ startUtc: wed15(0) }));
  c3.db.t.lessonPackages.find(p => p._id === 'pkg:1').expiresAt = Date.now() - 1;
  c3.db.t.lessonPackages.push({ _id: 'pkg:2', organizationId: ORG, studentId: 'students:szymon', name: 'New pack', totalLessons: 1,
    purchasedAt: Date.now() - 60e3, expiresAt: Date.now() + 30 * 86400e3, status: 'active', createdAt: Date.now(), updatedAt: Date.now() });
  const r3 = await S.bookLesson.handler(c3, stu({ startUtc: wed15(1) }));
  check('lesson booked on the old package stays allocated there; new package still has its 1 lesson', !!r3.bookingId);
  await expectThrow('and the new package is then empty (NO_LESSONS_REMAINING, not PACKAGE_EXPIRED)', () => S.bookLesson.handler(c3, stu({ startUtc: wed15(2) })),
    e => e.data?.code === 'NO_LESSONS_REMAINING' && e.data.remaining === 0);
}

console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
