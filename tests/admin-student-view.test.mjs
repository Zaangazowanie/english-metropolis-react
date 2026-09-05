// Real mutation and auth-guard bodies, with only Convex's registration/validator
// wrappers replaced. No network, credentials, or production state are touched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const bundle = await build({
  stdin: {
    contents: 'export * from "./convex/adminStudentView.ts"; export { requireStudent, requireAdmin, requireAdminOrStudent, requireStudentSelfOrPipelineKey } from "./convex/authHelpers.ts";',
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'convex-registration-stubs',
    setup(build) {
      build.onResolve({ filter: /(^convex\/values$|\/_generated\/server$)/ }, args => ({ path: args.path, namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({
        loader: 'js',
        contents: args.path === 'convex/values'
          ? 'export const v = new Proxy({}, { get: () => (...args) => args }); export class ConvexError extends Error {}'
          : 'export const mutation = definition => definition;',
      }));
    },
  }],
});
const M = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const hash = value => createHash('sha256').update(value).digest('hex');

function fixture({ role = 'super_admin', studentStatus = 'active', adminRemaining = 3_600_000 } = {}) {
  const now = Date.now();
  const tables = {
    users: [{ _id: 'users:admin', role, status: 'active' }, { _id: 'users:other', role: 'super_admin', status: 'active' }],
    students: [{ _id: 'students:one', name: 'Student One', slug: 'student-one', email: 'one@example.test',
      organizationId: 'org:one', level: 'B2', status: studentStatus, passwordHash: 'private-value', notes: 'Private teacher note' },
    { _id: 'students:two', name: 'Student Two', slug: 'student-two', organizationId: 'org:two', status: 'active' }],
    authSessions: [
      { _id: 'sessions:admin', kind: 'admin', userId: 'users:admin', tokenHash: hash('admin'), expiresAt: now + adminRemaining },
      { _id: 'sessions:other', kind: 'admin', userId: 'users:other', tokenHash: hash('other'), expiresAt: now + 3_600_000 },
      { _id: 'sessions:student', kind: 'student', studentId: 'students:one', tokenHash: hash('student'), expiresAt: now + 3_600_000 },
    ],
    auditLog: [],
  };
  let seq = 0;
  const db = {
    async get(id) { return Object.values(tables).flat().find(row => row._id === id) ?? null; },
    async insert(table, value) { const _id = `${table}:new${++seq}`; tables[table].push({ ...value, _id }); return _id; },
    async delete(id) { for (const table of Object.keys(tables)) tables[table] = tables[table].filter(row => row._id !== id); },
    query(table) {
      let matching = tables[table];
      return {
        withIndex(_name, select) {
          const q = { eq(key, value) { matching = matching.filter(row => row[key] === value); return q; } };
          select(q); return this;
        },
        async unique() { assert.ok(matching.length <= 1); return matching[0] ?? null; },
      };
    },
  };
  return { ctx: { db }, tables };
}
const start = (ctx, sessionToken = 'admin', studentId = 'students:one') => M.start.handler(ctx, { sessionToken, studentId });
const end = (ctx, studentSessionToken, sessionToken = 'admin') => M.end.handler(ctx, { sessionToken, studentSessionToken });

for (const role of ['admin', 'org_admin', 'teacher']) {
  test(`${role} cannot open or close student views`, async () => {
    const { ctx, tables } = fixture({ role });
    await assert.rejects(start(ctx), /Unauthorized/);
    await assert.rejects(end(ctx, 'student'), /Unauthorized/);
    assert.equal(tables.authSessions.length, 3);
    assert.equal(tables.auditLog.length, 0);
  });
}
test('student, invalid, disabled, and expired admin sessions cannot open a view', async () => {
  const { ctx, tables } = fixture();
  for (const token of ['student', 'invalid', '']) await assert.rejects(start(ctx, token), /Unauthorized/);
  tables.users[0].status = 'disabled';
  await assert.rejects(start(ctx), /Unauthorized/);
  tables.users[0].status = 'active'; tables.authSessions[0].expiresAt = Date.now() - 1;
  await assert.rejects(start(ctx), /Unauthorized/);
  assert.equal(tables.authSessions.length, 3);
});
for (const studentStatus of ['archived', 'graduated', 'paused']) {
  test(`refuses ${studentStatus} students`, async () => {
    const { ctx, tables } = fixture({ studentStatus });
    await assert.rejects(start(ctx), /not active/);
    assert.equal(tables.authSessions.length, 3);
  });
}
test('refuses a nonexistent student', async () => {
  const { ctx } = fixture();
  await assert.rejects(start(ctx, 'admin', 'students:missing'), /not active/);
});
test('creates a hashed 15-minute session with only the selected student permissions', async () => {
  const { ctx, tables } = fixture();
  const before = JSON.stringify(tables.students);
  const result = await start(ctx);
  const row = tables.authSessions.find(row => row.tokenHash === hash(result.sessionToken));
  assert.equal(result.success, true);
  assert.equal(row.kind, 'student');
  assert.equal(row.userId, 'users:admin');
  assert.equal(row.studentId, 'students:one');
  assert.equal(row.expiresAt - row.createdAt, 15 * 60 * 1000);
  assert.equal(result.expiresAt, row.expiresAt);
  assert.match(result.sessionToken, /^[0-9a-f]{64}$/);
  assert.notEqual(row.tokenHash, result.sessionToken);
  assert.deepEqual(Object.keys(result.student).sort(), ['_id', 'email', 'level', 'name', 'organizationId', 'slug']);
  assert.equal((await M.requireStudent(ctx, result.sessionToken)).student._id, 'students:one');
  assert.equal((await M.requireAdminOrStudent(ctx, result.sessionToken)).kind, 'student');
  await assert.rejects(M.requireAdmin(ctx, result.sessionToken), /Unauthorized/);
  await assert.rejects(M.requireStudentSelfOrPipelineKey(ctx, result.sessionToken, undefined, 'students:two'), /Unauthorized/);
  assert.equal(JSON.stringify(tables.students), before);
  assert.equal(tables.auditLog[0].action, 'student_view_started');
  assert.equal(tables.auditLog[0].userId, 'users:admin');
  assert.equal(tables.auditLog[0].targetId, 'students:one');
  assert.ok(!JSON.stringify(tables.auditLog).includes(result.sessionToken));
  assert.ok(!JSON.stringify(tables.auditLog).includes(row.tokenHash));
  row.expiresAt = Date.now() - 1;
  await assert.rejects(M.requireStudent(ctx, result.sessionToken), /Unauthorized/);
});
test('view expires no later than its opening admin session', async () => {
  const { ctx, tables } = fixture({ adminRemaining: 60_000 });
  assert.equal((await start(ctx)).expiresAt, tables.authSessions[0].expiresAt);
});
test('close refuses other admins views, normal student sessions, and admin tokens', async () => {
  const { ctx, tables } = fixture();
  const view = await start(ctx);
  for (const token of ['student', 'admin']) await assert.rejects(end(ctx, token), /only close/);
  await assert.rejects(end(ctx, view.sessionToken, 'other'), /only close/);
  await assert.rejects(end(ctx, view.sessionToken, 'student'), /Unauthorized/);
  assert.equal(tables.authSessions.length, 4);
  assert.equal(tables.auditLog.length, 1);
});
test('owner closes only that view, records audit, and can safely close twice', async () => {
  const { ctx, tables } = fixture();
  const first = await start(ctx);
  const second = await start(ctx, 'admin', 'students:two');
  assert.deepEqual(await end(ctx, first.sessionToken), { success: true, ended: true });
  await assert.rejects(M.requireStudent(ctx, first.sessionToken), /Unauthorized/);
  assert.equal((await M.requireStudent(ctx, second.sessionToken)).student._id, 'students:two');
  assert.equal((await M.requireStudent(ctx, 'student')).student._id, 'students:one');
  assert.equal((await M.requireAdmin(ctx, 'admin')).user._id, 'users:admin');
  assert.equal(tables.auditLog.at(-1).action, 'student_view_ended');
  assert.deepEqual(await end(ctx, first.sessionToken), { success: true, ended: false });
  assert.equal(tables.auditLog.length, 3);
});
test('expired view can still be removed by its owner', async () => {
  const { ctx, tables } = fixture();
  const view = await start(ctx);
  tables.authSessions.find(row => row.tokenHash === hash(view.sessionToken)).expiresAt = Date.now() - 1;
  assert.equal((await end(ctx, view.sessionToken)).ended, true);
});
