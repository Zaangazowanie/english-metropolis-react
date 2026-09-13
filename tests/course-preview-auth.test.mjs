import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
const { build } = createRequire(import.meta.url)('esbuild')
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../convex/coursePreviews.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'registration', setup(b) {
    b.onResolve({ filter: /(^convex\/values$|\/_generated\/server$)/ }, args => ({ path: args.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ loader: 'js', contents: args.path === 'convex/values'
      ? 'export const v = new Proxy({}, {get:()=>()=>({})}); export class ConvexError extends Error {}'
      : 'export const query = x => x;' }))
  } }],
})
const { context } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const hash = s => createHash('sha256').update(s).digest('hex')
function fixture(tokenKind = 'student', expired = false) {
  const tables = {
    authSessions: [{ kind: tokenKind, studentId: 'one', tokenHash: hash('valid'), expiresAt: Date.now() + (expired ? -1000 : 60000) }],
    students: [{ _id: 'one', slug: 'one', groupId: 'group', status: 'active', notes: 'private notes', passwordHash: 'secret' }],
    groups: [{ _id: 'group', courseId: 'GEN-B2-IDEAS' }],
    curriculumItems: [{ _id: 'p1', studentId: 'one', title: 'One', position: 1, status: 'planned', topics: [] },
      { _id: 'p2', studentId: 'two', title: 'Other student', position: 1, status: 'planned' }],
    lessons: [{ _id: 'l1', studentId: 'one', title: 'Taught', status: 'completed', transcript: 'private transcript' },
      { _id: 'l2', studentId: 'two', title: 'Other student', status: 'completed' }],
  }
  return { db: {
    async get(id) { return Object.values(tables).flat().find(r => r._id === id) || null },
    query(table) {
      let rows = tables[table]
      return { withIndex(name, fn) { const q = { eq(k, v) { rows = rows.filter(r => r[k] === v); return q } }; fn(q); return this },
        async collect() { return rows }, async unique() { return rows[0] || null } }
    },
  } }
}
test('preview context uses only the student from the authenticated session', async () => {
  const result = await context.handler(fixture(), { sessionToken: 'valid', studentId: 'two' })
  assert.deepEqual(result.plan.map(p => p.id), ['p1'])
  assert.deepEqual(result.lessons.map(p => p.id), ['l1'])
  assert.equal(result.courseId, 'GEN-B2-IDEAS')
  assert.ok(!JSON.stringify(result).includes('private'))
  assert.ok(!JSON.stringify(result).includes('secret'))
})
test('expired, invalid and admin tokens cannot read student preview context', async () => {
  for (const [ctx, token] of [[fixture(), 'wrong'], [fixture('admin'), 'valid'], [fixture('student', true), 'valid']]) {
    await assert.rejects(context.handler(ctx, { sessionToken: token }), /Unauthorized/)
  }
})
