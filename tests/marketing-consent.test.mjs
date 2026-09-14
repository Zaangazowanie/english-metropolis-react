// Real handlers with an in-memory database; no network, emails or production data.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createHash, webcrypto } from 'node:crypto'
import test from 'node:test'
globalThis.crypto ??= webcrypto
const builder = `const pass=x=>x; export const action=pass,query=pass,mutation=pass,internalAction=pass,internalQuery=pass,internalMutation=pass;
const ref=p=>new Proxy(()=>{}, {get:(_,k)=>k==='__path'?p:ref(p?p+'.'+String(k):String(k))}); export const internal=ref(''),api=ref('');`
const bundle = await build({
  stdin: { contents: `export * as preferences from './convex/emailPreferences'; export * as password from './convex/studentAuth'; export * as google from './convex/googleAuth';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'inert-builders', setup(b) {
    b.onResolve({ filter: /_generated\/(server|api)$/ }, () => ({ path: 'builders', namespace: 'test' }))
    b.onResolve({ filter: /^\.\/students$/ }, () => ({ path: 'students', namespace: 'test' }))
    b.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'builders' ? builder : 'export const bajlaState=()=>({});', loader: 'js' }))
  } }],
})
const { preferences: P, password: A, google: G } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const hash = s => createHash('sha256').update(s).digest('hex')

function fixture() {
  const tables = { students: [], authSessions: [], marketingPreferences: [], marketingConsentEvents: [], marketingUnsubscribeTokens: [] }
  let n = 0
  const ctx = { tables, scheduled: [], db: {
    async get(id) { return Object.values(tables).flat().find(r => r._id === id) || null },
    async insert(table, row) { const _id = `${table}-${++n}`; tables[table].push({ ...row, _id }); return _id },
    async patch(id, patch) { const row = await this.get(id); assert.ok(row); Object.assign(row, patch) },
    query(table) {
      let rows = tables[table]
      return { withIndex(_name, fn) { const q = { eq(k,v) { rows = rows.filter(r => r[k] === v); return q } }; fn(q); return this },
        async unique() { assert.ok(rows.length <= 1); return rows[0] || null }, async first() { return rows[0] || null } }
    },
  }, scheduler: { async runAfter(delay, ref, args) { ctx.scheduled.push({ delay, ref: ref.__path, args }) } } }
  ctx.runMutation = async (ref,args) => {
    const [module, name] = ref.__path.split('.')
    return ({ studentAuth: A, googleAuth: G })[module][name].handler(ctx,args)
  }
  ctx.runQuery = ctx.runMutation
  return ctx
}
const signup = { name: 'Test Learner', email: 'test@example.invalid', passwordHash: 'hashed', dateOfBirth: '1990-01-01' }
async function addStudent(ctx, choice) {
  const result = await A.signupInsert.handler(ctx, { ...signup, ...(choice === undefined ? {} : { consentMarketing: choice, marketingLocale: 'pl' }) })
  assert.equal(result.success, true)
  return result
}

test('omitted and unchecked signup consent do not subscribe; checked choice records exact notice', async () => {
  for (const value of [undefined, false, true]) {
    const ctx = fixture(), result = await addStudent(ctx,value)
    assert.deepEqual(await P.mine.handler(ctx,{sessionToken:result.sessionToken}),{subscribed:value === true})
    const events=ctx.tables.marketingConsentEvents
    assert.equal(events.length,value === undefined ? 0 : 1)
    if(value !== undefined) {
      assert.equal(events[0].subscribed,value); assert.equal(events[0].source,'signup_email')
      assert.equal(events[0].locale,'pl'); assert.match(events[0].noticeText,/dobrowolna/)
      assert.equal(events[0].noticeVersion,'email-offers-2026-09-14'); assert.ok(events[0].at > 0)
    }
  }
})

test('password action forwards consent and locale into the actual insertion', async () => {
  const ctx=fixture()
  const result=await A.studentSignupAction.handler(ctx,{...signup,password:'test-only-password',consentMarketing:true,marketingLocale:'en'})
  assert.equal(result.success,true)
  assert.equal(ctx.tables.marketingPreferences[0].subscribed,true)
  assert.match(ctx.tables.marketingConsentEvents[0].noticeText,/Email me EnglishMetro/)
  assert.equal(ctx.scheduled.length,1)
  assert.equal(ctx.scheduled[0].ref,'studentAuth.sendVerificationEmail')
})

test('legacy mutation also records an explicit choice and permits unchecked signup', async () => {
  for(const choice of [false,true]) {
    const ctx=fixture()
    const result=await A.studentSignup.handler(ctx,{...signup,password:'test-only-password',consentMarketing:choice})
    assert.equal(result.success,true); assert.equal(ctx.tables.marketingPreferences[0].subscribed,choice)
  }
})

test('Google signup records its choice; signing in again does not override an opt-out', async () => {
  const ctx=fixture()
  process.env.GOOGLE_CLIENT_ID='test-audience'
  const original=globalThis.fetch
  globalThis.fetch=async()=>Response.json({ aud:'test-audience',email_verified:'true',email:signup.email,given_name:'Test',family_name:'Learner' })
  try {
    const first=await G.googleSignIn.handler(ctx,{idToken:'test-token',dateOfBirth:signup.dateOfBirth,consentMarketing:true,marketingLocale:'en'})
    assert.equal(first.success,true); assert.equal(ctx.tables.marketingConsentEvents[0].source,'signup_google')
    await P.setMine.handler(ctx,{sessionToken:first.sessionToken,subscribed:false,locale:'en'})
    await G.googleSignIn.handler(ctx,{idToken:'test-token',consentMarketing:true})
    assert.equal(ctx.tables.marketingPreferences[0].subscribed,false)
    assert.equal(ctx.tables.marketingConsentEvents.length,2)
  } finally { globalThis.fetch=original; delete process.env.GOOGLE_CLIENT_ID }
})

test('expired, missing and admin sessions cannot read or change student consent', async () => {
  const ctx=fixture(),result=await addStudent(ctx,true)
  for(const sessionToken of ['bad','']) {
    await assert.rejects(P.mine.handler(ctx,{sessionToken}),/Unauthorized/)
    await assert.rejects(P.setMine.handler(ctx,{sessionToken,subscribed:false,locale:'en'}),/Unauthorized/)
  }
  const row=ctx.tables.authSessions.find(x=>x.tokenHash===hash(result.sessionToken))
  row.expiresAt=0
  await assert.rejects(P.setMine.handler(ctx,{sessionToken:result.sessionToken,subscribed:false,locale:'en'}),/Unauthorized/)
  row.expiresAt=Date.now()+60000; row.kind='admin'
  await assert.rejects(P.mine.handler(ctx,{sessionToken:result.sessionToken}),/Unauthorized/)
  assert.equal(ctx.tables.marketingPreferences[0].subscribed,true)
})

test('only verified, active, explicitly opted-in accounts can produce a recipient link', async () => {
  const ctx=fixture(),result=await addStudent(ctx,true),args={studentId:result.student._id}
  assert.equal(await P.prepareRecipient.handler(ctx,args),null)
  const student=await ctx.db.get(args.studentId)
  student.emailVerifiedAt=Date.now(); student.status='archived'
  assert.equal(await P.prepareRecipient.handler(ctx,args),null)
  student.status='active'
  const recipient=await P.prepareRecipient.handler(ctx,args)
  assert.equal(recipient.email,signup.email)
  assert.match(recipient.unsubscribeUrl,/^https:\/\/englishmetro.com\/email-preferences#unsubscribe=[a-f0-9]{64}$/)
  const raw=recipient.unsubscribeUrl.split('=')[1]
  assert.equal(ctx.tables.marketingUnsubscribeTokens[0].tokenHash,hash(raw))
  assert.ok(!JSON.stringify(ctx.tables).includes(raw))
  await P.setMine.handler(ctx,{sessionToken:result.sessionToken,subscribed:false,locale:'en'})
  assert.equal(await P.prepareRecipient.handler(ctx,args),null)
})

test('unsubscribe requires a valid bearer token, is repeatable and blocks future recipients without touching lessons', async () => {
  const ctx=fixture(),result=await addStudent(ctx,true)
  const student=await ctx.db.get(result.student._id); student.emailVerifiedAt=Date.now()
  const before=JSON.stringify(student)
  const recipient=await P.prepareRecipient.handler(ctx,{studentId:student._id})
  assert.deepEqual(await P.unsubscribe.handler(ctx,{token:'x'.repeat(64)}),{success:false})
  assert.deepEqual(await P.unsubscribe.handler(ctx,{token:'0'.repeat(64)}),{success:false})
  assert.equal(ctx.tables.marketingPreferences[0].subscribed,true)
  const token=recipient.unsubscribeUrl.split('=')[1]
  assert.deepEqual(await P.unsubscribe.handler(ctx,{token}),{success:true})
  assert.deepEqual(await P.unsubscribe.handler(ctx,{token}),{success:true})
  assert.equal(ctx.tables.marketingConsentEvents.length,2)
  assert.equal(await P.prepareRecipient.handler(ctx,{studentId:student._id}),null)
  assert.equal(JSON.stringify(student),before)
  // Old email links remain valid after a deliberate resubscription.
  await P.setMine.handler(ctx,{sessionToken:result.sessionToken,subscribed:true,locale:'en'})
  await P.unsubscribe.handler(ctx,{token})
  assert.equal(ctx.tables.marketingPreferences[0].subscribed,false)
})

test('one-time existing-student update grants no subscription and its link records a real opt-out', async () => {
  const realNow=Date.now
  Date.now=()=>Date.UTC(2026,8,14,9)
  try {
    const ctx=fixture(),result=await addStudent(ctx,undefined)
    const s=await ctx.db.get(result.student._id)
    Object.assign(s,{createdAt:Date.UTC(2026,8,1),email:'learner@example.com',googleEmail:'learner@example.com'})
    const args={studentId:s._id,campaignKey:'raty-zero-2026-09-14'}
    const recipient=await P.prepareExistingStudentUpdate.handler(ctx,args)
    assert.equal(recipient.email,'learner@example.com')
    assert.equal(ctx.tables.marketingPreferences.length,0)
    assert.equal(ctx.tables.marketingConsentEvents.length,0)
    const token=recipient.unsubscribeUrl.split('=')[1]
    assert.deepEqual(await P.unsubscribe.handler(ctx,{token}),{success:true})
    assert.deepEqual(await P.unsubscribe.handler(ctx,{token}),{success:true})
    assert.equal(ctx.tables.marketingPreferences[0].subscribed,false)
    assert.equal(ctx.tables.marketingConsentEvents.length,1)
    assert.equal(await P.prepareExistingStudentUpdate.handler(ctx,args),null)
  } finally {Date.now=realNow}
})

test('one-time update excludes other schools, new signups, inactive accounts, placeholders and expired campaign', async () => {
  const realNow=Date.now
  Date.now=()=>Date.UTC(2026,8,14,9)
  try {
    const ctx=fixture(),result=await addStudent(ctx,undefined)
    const s=await ctx.db.get(result.student._id)
    const base={...s,createdAt:Date.UTC(2026,8,1),email:'learner@example.com',googleEmail:'learner@example.com'}
    for(const patch of [{organizationId:'other'},{status:'archived'},{createdAt:Date.UTC(2026,8,14,9)},
      {email:'placeholder@englishmetro.com',googleEmail:''},{email:'test@example.invalid',googleEmail:''}]) {
      Object.assign(s,base,patch)
      assert.equal(await P.prepareExistingStudentUpdate.handler(ctx,{studentId:s._id,campaignKey:'raty-zero-2026-09-14'}),null)
    }
    Object.assign(s,base)
    Date.now=()=>Date.UTC(2026,8,16)
    assert.equal(await P.prepareExistingStudentUpdate.handler(ctx,{studentId:s._id,campaignKey:'raty-zero-2026-09-14'}),null)
    assert.equal(ctx.tables.marketingUnsubscribeTokens.length,0)
  } finally {Date.now=realNow}
})
