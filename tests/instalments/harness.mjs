// Offline harness for instalment plans. Runs the REAL handler bodies against an
// in-memory database (same shape as tests/scheduling/harness.mjs).
import { createHash } from 'node:crypto';
import * as B from './instalments.bundle.mjs';
const P = B.plans, O = B.ops;

let PASS = 0, FAIL = 0;
function check(label, cond, detail) {
  if (cond) { PASS++; console.log('  PASS  ' + label + (detail ? '   ' + detail : '')); }
  else { FAIL++; console.log('  FAIL  ' + label + (detail ? '   ' + detail : '')); }
}
async function expectThrow(label, fn, re) {
  try { await fn(); check(label, false, 'did not throw'); }
  catch (e) { const ok = re ? re.test(e.message) : true; check(label, ok, e.message); }
}

let seq = 0;
class Q {
  constructor(rows) { this.rows = rows; this.cons = []; }
  withIndex(_n, fn) { const cons = []; const q = { eq: (f, val) => { cons.push([f, val]); return q; } }; if (fn) fn(q); this.cons = cons; return this; }
  _m() { return this.rows.filter(r => this.cons.every(([f, val]) => r[f] === val)); }
  async unique() { const m = this._m(); if (m.length > 1) throw new Error('not unique'); return m[0] ?? null; }
  async first() { return this._m()[0] ?? null; }
  async collect() { return this._m(); }
}
class DB {
  constructor() { this.t = { students: [], users: [], authSessions: [], lessonPackages: [], lessonOrders: [], lessonBookings: [], operationsAlerts: [], priceQuotes: [], auditLog: [], organizations: [] }; }
  async insert(table, doc) { const _id = table + ':' + (++seq); this.t[table].push({ ...doc, _id, _creationTime: Date.now() }); return _id; }
  async get(id) { for (const rows of Object.values(this.t)) { const r = rows.find(x => x._id === id); if (r) return r; } return null; }
  async patch(id, f) { const r = await this.get(id); if (!r) throw new Error('no row ' + id); Object.assign(r, f); }
  query(table) { if (!this.t[table]) throw new Error('unknown table ' + table); return new Q(this.t[table]); }
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const DAY = 86400e3;
function fixture() {
  const db = new DB(), now = Date.now();
  db.t.organizations.push({ _id: 'org:pvt', name: 'EM PVT' });
  db.t.users.push({ _id: 'users:mike', name: 'Michael', email: 'michael@example.com', role: 'super_admin', status: 'active', organizationId: 'org:pvt' });
  db.t.students.push({ _id: 'students:justyna', name: 'Justyna', slug: 'justyna', organizationId: 'org:pvt', status: 'active', email: 'justyna@example.com', emailVerifiedAt: now - 1e6 });
  db.t.authSessions.push({ _id: 'sess:admin', kind: 'admin', userId: 'users:mike', tokenHash: sha('admin-token'), createdAt: now, expiresAt: now + 1e9 });
  const scheduled = [];
  const ctx = { db, scheduled, scheduler: { runAfter: async (_d, ref, args) => scheduled.push({ path: ref.__path, args }) } };
  return { db, ctx, now };
}
const base = (over = {}) => ({ sessionToken: 'admin-token', studentId: 'students:justyna', totalPLN: 2160, totalLessons: 24, instalments: 3, firstDueAt: Date.now() + 7 * DAY, label: 'Pakiet 24 lekcji', reason: 'Agreed 3 Sep: three payments of 720', ...over });

console.log('\n=== A. splits ===');
check('2160 → 720/720/720', P.splitEvenly(216000, 3).join() === '216000,216000,216000'.split(',').map(() => 72000).join());
check('remainder on the last part', P.splitEvenly(100, 3).join() === '33,33,34');
check('24 lessons → 8/8/8', P.splitEvenly(24, 3).join() === '8,8,8');
check('25 lessons → 8/8/9', P.splitEvenly(25, 3).join() === '8,8,9');

console.log('\n=== B. createInstalmentPlan ===');
{
  const { db, ctx } = fixture();
  const r = await P.createInstalmentPlan.handler(ctx, base());
  check('returns planRef + 3 quotes', /^PLAN-/.test(r.planRef) && r.quotes.length === 3);
  const rows = db.t.priceQuotes;
  check('3 priceQuotes rows, all open, kind negotiated', rows.length === 3 && rows.every(q => q.status === 'open' && q.kind === 'negotiated'));
  check('amounts sum to 216000 grosze', rows.reduce((n, q) => n + q.amount, 0) === 216000, rows.map(q => q.amount).join('/'));
  check('each quote releases 8 lessons via packageLines', rows.every(q => q.packageLines.length === 1 && q.packageLines[0].lessons === 8 && q.packageLines[0].qty === 1));
  check('packageLine amount equals quote amount (preparePayment sum check)', rows.every(q => q.packageLines[0].amount === q.amount));
  check('dueAt spaced 30 days', rows[1].dueAt - rows[0].dueAt === 30 * DAY && rows[2].dueAt - rows[1].dueAt === 30 * DAY);
  check('expiresAt = dueAt + 90 days (link outlives the due date)', rows.every(q => q.expiresAt === q.dueAt + P.PLAN_GRACE_MS));
  check('labels carry rata n/N', rows.map(q => q.label).join('|') === 'Pakiet 24 lekcji · rata 1/3|Pakiet 24 lekcji · rata 2/3|Pakiet 24 lekcji · rata 3/3');
  check('checkoutPath is the ordinary quote checkout', r.quotes.every(q => q.checkoutPath === `/checkout?quote=${q.quoteRef}`));
  check('audit row written', db.t.auditLog.some(a => a.action === 'billing.instalmentPlanCreated'));
  await expectThrow('bad token is Unauthorized', () => P.createInstalmentPlan.handler(ctx, base({ sessionToken: 'nope' })), /Unauthorized/);
  await expectThrow('1 instalment refused', () => P.createInstalmentPlan.handler(ctx, base({ instalments: 1 })), /2 to 12/);
  await expectThrow('13 instalments refused', () => P.createInstalmentPlan.handler(ctx, base({ instalments: 13 })), /2 to 12/);
  await expectThrow('fewer lessons than instalments refused', () => P.createInstalmentPlan.handler(ctx, base({ totalLessons: 2 })), /at least one lesson/);
  await expectThrow('short reason refused', () => P.createInstalmentPlan.handler(ctx, base({ reason: 'ok' })), /reason/);
  await expectThrow('first due date in the past refused', () => P.createInstalmentPlan.handler(ctx, base({ firstDueAt: Date.now() - 3 * DAY })), /past/);
  await expectThrow('interval 3 days refused', () => P.createInstalmentPlan.handler(ctx, base({ intervalDays: 3 })), /7 to 92/);
  await expectThrow('unknown student', () => P.createInstalmentPlan.handler(ctx, base({ studentId: 'students:ghost' })), /not found/);
}

console.log('\n=== C. instalment_overdue in reconcileAlerts ===');
{
  const { db, ctx } = fixture();
  const r = await P.createInstalmentPlan.handler(ctx, base({ firstDueAt: Date.now() + 1 * DAY }));
  let out = await O.reconcileAlerts.handler(ctx, {});
  check('nothing overdue before dueAt', out.candidates === 0 && db.t.operationsAlerts.length === 0);
  // Move instalment 1 into the past.
  const q1 = db.t.priceQuotes.find(q => q.instalmentNo === 1);
  q1.dueAt = Date.now() - 2 * DAY;
  out = await O.reconcileAlerts.handler(ctx, {});
  const alert = db.t.operationsAlerts.find(a => a.kind === 'instalment_overdue');
  check('one instalment_overdue alert opened', out.opened === 1 && !!alert && alert.status === 'open');
  check('alert names the student, the instalment and the quote', alert && alert.title === 'Justyna has not paid instalment 1/3' && alert.quoteRef === q1.quoteRef && alert.studentId === 'students:justyna');
  check('message states the amount and the lateness', alert && /720,00 PLN was due on \d{4}-\d{2}-\d{2} \(2 days late\)/.test(alert.message), alert && alert.message);
  check('message says lessons abate, nothing accelerated', alert && /future lessons abate, nothing is accelerated/.test(alert.message));
  const details = alert && JSON.parse(alert.details);
  check('details carry planRef, checkoutPath, email', details && details.planRef === r.planRef && details.checkoutPath === `/checkout?quote=${q1.quoteRef}` && details.email === 'justyna@example.com');
  out = await O.reconcileAlerts.handler(ctx, {});
  check('idempotent: second run updates, opens nothing', out.opened === 0 && out.updated === 1 && db.t.operationsAlerts.length === 1);
  // Paid: the quote is consumed by finalizePaid → the alert resolves itself.
  q1.status = 'consumed';
  out = await O.reconcileAlerts.handler(ctx, {});
  check('paying the instalment resolves the alert', out.resolved === 1 && db.t.operationsAlerts[0].status === 'resolved');
  // Boundary: dueAt exactly now is not overdue; one ms earlier is.
  const q2 = db.t.priceQuotes.find(q => q.instalmentNo === 2);
  const now = Date.now();
  check('dueAt == now is not overdue', O.instalmentOverdueCandidate({ ...q2, dueAt: now }, null, now) === null);
  check('dueAt == now - 1ms is overdue', O.instalmentOverdueCandidate({ ...q2, dueAt: now - 1 }, null, now) !== null);
  check('a self-serve quote with no planRef never alerts', O.instalmentOverdueCandidate({ ...q2, planRef: undefined, dueAt: now - DAY }, null, now) === null);
  check('a cancelled instalment never alerts', O.instalmentOverdueCandidate({ ...q2, status: 'cancelled', dueAt: now - DAY }, null, now) === null);
}

console.log('\n=== D. reminder cadence ===');
{
  const now = Date.now();
  const q = { planRef: 'PLAN-x', status: 'open', dueAt: now + 10 * DAY, remindersSentAt: [] };
  check('10 days out: no reminder', P.reminderDue(q, now) === false);
  check('3 days out: reminder', P.reminderDue({ ...q, dueAt: now + 3 * DAY }, now) === true);
  check('reminded 1 day ago: no repeat', P.reminderDue({ ...q, dueAt: now + 2 * DAY, remindersSentAt: [now - DAY] }, now) === false);
  check('reminded 3 days ago and overdue: repeat', P.reminderDue({ ...q, dueAt: now - DAY, remindersSentAt: [now - 3 * DAY] }, now) === true);
  check('consumed: never', P.reminderDue({ ...q, status: 'consumed', dueAt: now - DAY }, now) === false);
  check('no planRef: never', P.reminderDue({ ...q, planRef: undefined, dueAt: now - DAY }, now) === false);
  const { db, ctx } = fixture();
  await P.createInstalmentPlan.handler(ctx, base({ firstDueAt: now + 2 * DAY }));
  const due = await P.listReminderCandidates.handler(ctx, { now });
  check('listReminderCandidates: only instalment 1 (due in 2 days) is a candidate', due.length === 1 && due[0].instalmentNo === 1 && due[0].overdue === false && due[0].studentEmail === 'justyna@example.com');
  db.t.students[0].email = undefined;
  const none = await P.listReminderCandidates.handler(ctx, { now });
  check('a student without an e-mail is skipped, not crashed', none.length === 0);
}

console.log('\n=== E. plan mail status + listPlans + cancel ===');
{
  const { db, ctx } = fixture();
  const r = await P.createInstalmentPlan.handler(ctx, base());
  await P.requestPlanMail.handler(ctx, { sessionToken: 'admin-token', planRef: r.planRef, siteBase: 'https://englishmetro.com' });
  check('requestPlanMail marks pending and schedules deliverPlanMail', db.t.priceQuotes.every(q => q.planMailStatus === 'pending') && ctx.scheduled[0]?.path === 'instalmentPlans.deliverPlanMail');
  await expectThrow('requestPlanMail needs a superadmin', () => P.requestPlanMail.handler(ctx, { sessionToken: 'nope', planRef: r.planRef }), /Unauthorized/);
  const mail = await P.getPlanForMail.handler(ctx, { planRef: r.planRef });
  check('getPlanForMail: 3 instalments, total 216000, 24 lessons, label without rata suffix', mail.instalments.length === 3 && mail.totalAmount === 216000 && mail.totalLessons === 24 && mail.label === 'Pakiet 24 lekcji');
  await P.markPlanMail.handler(ctx, { planRef: r.planRef, status: 'failed', error: 'relay 500', at: Date.now() });
  let plans = await P.listPlans.handler(ctx, { sessionToken: 'admin-token' });
  check('listPlans surfaces a failed mail with its error', plans[0].mailStatus === 'failed' && plans[0].mailError === 'relay 500');
  await P.markPlanMail.handler(ctx, { planRef: r.planRef, status: 'sent', at: Date.now() });
  plans = await P.listPlans.handler(ctx, { sessionToken: 'admin-token' });
  check('sent: status sent, reminder history started on every instalment', plans[0].mailStatus === 'sent' && db.t.priceQuotes.every(q => q.remindersSentAt.length === 1));
  check('listPlans totals', plans[0].totalAmount === 216000 && plans[0].paidAmount === 0 && plans[0].totalLessons === 24 && plans[0].overdue === 0);
  const q3 = db.t.priceQuotes.find(q => q.instalmentNo === 3);
  await P.cancelInstalment.handler(ctx, { sessionToken: 'admin-token', quoteRef: q3.quoteRef, reason: 'renegotiated' });
  check('cancelInstalment flips one open quote to cancelled', q3.status === 'cancelled' && db.t.auditLog.some(a => a.action === 'billing.instalmentCancelled'));
  await expectThrow('cancelling it twice is refused', () => P.cancelInstalment.handler(ctx, { sessionToken: 'admin-token', quoteRef: q3.quoteRef, reason: 'again' }), /not open/);
  q3.status = 'consumed';
  await expectThrow('a consumed instalment cannot be cancelled', () => P.cancelInstalment.handler(ctx, { sessionToken: 'admin-token', quoteRef: q3.quoteRef, reason: 'x' }), /consumed/);
}

console.log('\n=== F. methodGroupOf (P24 method list) ===');
{
  const g = B.methodGroupOf;
  check('BLIK', g({ id: 154, group: 'Blik', name: 'BLIK' }) === 'blik');
  check('PayPo 317 in Installments group is paypo', g({ id: 317, group: 'Installments', name: 'PayPo' }) === 'paypo');
  check('Raty 303 in Installments group is installments (was: transfer)', g({ id: 303, group: 'Installments', name: 'Raty' }) === 'installments');
  check('an unknown id in the Installments group is installments', g({ id: 999, group: 'Installments', name: 'Raty 0%' }) === 'installments');
  check('card 145', g({ id: 145, group: 'Cards', name: 'Karta płatnicza' }) === 'card');
  check('a bank is transfer', g({ id: 20, group: 'Banks', name: 'mBank' }) === 'transfer');
}

console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
