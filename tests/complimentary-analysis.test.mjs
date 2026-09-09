import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const root = fileURLToPath(new URL('../', import.meta.url));
const built = await build({
  stdin: { contents: `export * from './convex/complimentaryAnalysis';
    export * from './convex/analysisAccess';
    export { analysisEligibility, myAnalysisSetting, revokeAnalysisConsent, dueAccountBackfill } from './convex/students';
    export { createAnalysis } from './convex/analytics';
    export { myOffer, createQuote } from './convex/analysisOffers';`, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  plugins: [{ name: 'convex-stubs', setup(b) {
    b.onResolve({ filter: /(^|\/)\_generated\/(server|api|dataModel)$/ }, () =>
      ({ path: path.join(root, 'tests/scheduling/cx/genstub.js') }));
    b.onResolve({ filter: /^convex\/values$/ }, () =>
      ({ path: path.join(root, 'tests/scheduling/cx/vstub.js') }));
  } }],
});
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const sha = s => createHash('sha256').update(s).digest('hex');
process.env.PIPELINE_API_KEY = 'test-pipeline';
class DB {
  constructor() { this.tables = {}; this.seq = 0; }
  rows(t) { return this.tables[t] ??= []; }
  query(t) {
    let rows = this.rows(t), predicates = [];
    const q = {
      withIndex(_n, fn) { const builder = { eq(k,v) { predicates.push(r=>r[k]===v); return builder; } }; fn?.(builder); return q; },
      async collect() { return rows.filter(r=>predicates.every(p=>p(r))); },
      async unique() { const a=await q.collect(); assert.ok(a.length<=1); return a[0]??null; },
      async first() { return (await q.collect())[0]??null; },
    }; return q;
  }
  async get(id) { return Object.values(this.tables).flat().find(r=>r._id===id)??null; }
  async insert(t,doc) { const id=t+':'+(++this.seq); this.rows(t).push({...structuredClone(doc),_id:id}); return id; }
  async patch(id,patch) { const r=await this.get(id); assert.ok(r); Object.assign(r,structuredClone(patch)); }
}
async function fixture({ total=24 }={}) {
  const db=new DB(), now=Date.now(), start=Date.parse('2025-01-01T00:00:00Z');
  const studentId=await db.insert('students',{slug:'learner',name:'Learner',organizationId:'org',status:'active',createdAt:now});
  const userId=await db.insert('users',{role:'super_admin',status:'active',organizationId:'org'});
  await db.insert('authSessions',{tokenHash:sha('admin'),kind:'admin',userId,expiresAt:now+3600000});
  await db.insert('authSessions',{tokenHash:sha('student'),kind:'student',studentId,expiresAt:now+3600000});
  const packageId=await db.insert('lessonPackages',{studentId,organizationId:'org',name:'24 lessons',totalLessons:total,
    purchasedAt:start,expiresAt:now+86400000,status:'active'});
  const ctx={db}, student=await db.get(studentId);
  const args={sessionToken:'admin',studentId,packageId,consentAttestation:'Owner confirms that the student has already consented.',reason:'Complimentary analysis for the existing package.'};
  const lesson=async (n, {bookingStatus='completed',status='completed',booked=true}={}) => {
    const timestamp=start+n*86400000, date=new Date(timestamp).toISOString().slice(0,10);
    if(booked)await db.insert('lessonBookings',{studentId,dateWarsaw:date,startUtc:timestamp,status:bookingStatus});
    return db.insert('lessons',{studentId,date,title:'Lesson '+n,status});
  };
  const eligible=lessonId=>api.analysisEligibility.handler(ctx,{apiKey:'test-pipeline',studentId,lessonId});
  return {db,ctx,student,studentId,userId,packageId,args,lesson,eligible};
}
const grant=f=>api.grantPackage.handler(f.ctx,f.args);
test('gift records consent and audit, no payment/order/package mutation; retry is idempotent',async()=>{
  const f=await fixture(), before=structuredClone(await f.db.get(f.packageId));
  const result=await grant(f);assert.equal(result.totalLessons,24);assert.equal(result.chargePLN,0);
  assert.deepEqual(await f.db.get(f.packageId),before);
  assert.equal(f.db.rows('p24Payments').length,0);assert.equal(f.db.rows('lessonOrders').length,0);
  assert.equal(f.student.lessonAnalysis,undefined);
  assert.equal((await grant(f)).reason,'already_granted');
  assert.equal(f.db.rows('analysisPackageGrants').length,1);assert.equal(f.db.rows('auditLog').length,1);
});
test('dry run does not grant or audit',async()=>{
  const f=await fixture();assert.equal((await api.grantPackage.handler(f.ctx,{...f.args,dryRun:true})).totalLessons,24);
  assert.equal(f.db.rows('analysisPackageGrants').length,0);assert.equal(f.db.rows('auditLog').length,0);
});
test('only superadmin can grant',async()=>{
  const f=await fixture();await f.db.patch(f.userId,{role:'admin'});
  await assert.rejects(()=>grant(f),/superadmin/);await assert.rejects(()=>api.grantPackage.handler(f.ctx,{...f.args,sessionToken:'student'}),/Unauthorized/);
});
for(const scenario of ['minor','wrong-owner','wrong-org','cancelled','expired','revoked-account','revoked-lesson','revoked-package','missing-attestation']){
  test('refuses '+scenario,async()=>{
    const f=await fixture();
    if(scenario==='minor') f.student.isMinor=true;
    if(scenario==='wrong-owner')await f.db.patch(f.packageId,{studentId:'someone-else'});
    if(scenario==='wrong-org')await f.db.patch(f.packageId,{organizationId:'other'});
    if(scenario==='cancelled')await f.db.patch(f.packageId,{status:'cancelled'});
    if(scenario==='expired')await f.db.patch(f.packageId,{expiresAt:1});
    if(scenario==='revoked-account')f.student.lessonAnalysis={grantedAt:1,revokedAt:2};
    if(scenario==='revoked-lesson')await f.db.insert('analysisEntitlements',{studentId:f.studentId,revokedAt:2});
    if(scenario==='revoked-package')await f.db.insert('analysisPackageGrants',{studentId:f.studentId,revokedAt:2});
    if(scenario==='missing-attestation')f.args.consentAttestation='';
    await assert.rejects(()=>grant(f));assert.equal(f.db.rows('auditLog').length,0);
  });
}
test('covers all 24 allocated lessons, including earlier lessons, but not lesson 25 or the next package',async()=>{
  const f=await fixture();const ids=[];for(let n=1;n<=25;n++)ids.push(await f.lesson(n));
  await f.db.insert('lessonPackages',{studentId:f.studentId,organizationId:'org',name:'Next package',totalLessons:24,
    purchasedAt:Date.parse('2025-01-01T00:00:01Z'),status:'active'});
  await grant(f);
  for(const id of ids.slice(0,24))assert.equal((await f.eligible(id)).allowed,true);
  assert.equal((await f.eligible(ids[24])).allowed,false);
  assert.equal((await f.eligible()).reason,'lesson_required');
});
test('older package consumes earlier lessons before the gifted package',async()=>{
  const f=await fixture();const first=await f.lesson(1),second=await f.lesson(2);
  await f.db.insert('lessonPackages',{studentId:f.studentId,organizationId:'org',name:'Earlier',totalLessons:1,purchasedAt:0,status:'active'});
  await grant(f);assert.equal((await f.eligible(first)).allowed,false);assert.equal((await f.eligible(second)).allowed,true);
});
test('no-shows consume capacity but cannot be analysed; timely cancellations do not',async()=>{
  const f=await fixture({total:2});
  const noShow=await f.lesson(1,{bookingStatus:'no_show'}),taught=await f.lesson(2),outside=await f.lesson(3);
  await f.db.insert('lessonBookings',{studentId:f.studentId,dateWarsaw:'2025-01-01',startUtc:1,status:'cancelled'});
  await grant(f);assert.equal((await f.eligible(noShow)).allowed,false);assert.equal((await f.eligible(taught)).allowed,true);
  assert.equal((await f.eligible(outside)).allowed,false);
});
test('revocation immediately disables gift reads/writes and prevents re-grant',async()=>{
  const f=await fixture(),id=await f.lesson(1);await grant(f);
  await api.revokeAnalysisConsent.handler(f.ctx,{sessionToken:'student'});
  assert.equal((await f.eligible(id)).allowed,false);await assert.rejects(()=>grant(f),/revoked/);
  await assert.rejects(()=>api.createAnalysis.handler(f.ctx,{apiKey:'test-pipeline',studentId:f.studentId,lessonId:id}),/refused/);
});
test('minor and other learner lessons never pass; paid account behavior is preserved',async()=>{
  const f=await fixture(),id=await f.lesson(1);await grant(f);
  const foreign=await f.db.insert('lessons',{studentId:'other',date:'2025-01-02'});
  assert.equal((await f.eligible(foreign)).reason,'lesson_mismatch');
  f.student.isMinor=true;assert.equal((await f.eligible(id)).reason,'minor');
  f.student.isMinor=false;f.student.lessonAnalysis={grantedAt:1};
  assert.equal((await f.eligible()).allowed,true);assert.equal((await f.eligible(foreign)).allowed,false);
});
test('settings show the gift, covered lesson has no upsell, backfill excludes uncovered lessons',async()=>{
  const f=await fixture({total:1}),included=await f.lesson(1),excluded=await f.lesson(2);await grant(f);
  const setting=await api.myAnalysisSetting.handler(f.ctx,{sessionToken:'student'});
  assert.equal(setting.allowed,true);assert.equal(setting.reason,'complimentary_package');
  assert.equal(setting.complimentaryPackages[0].totalLessons,1);
  const offer=await api.myOffer.handler(f.ctx,{sessionToken:'student',lessonId:included});
  assert.equal(offer.show,false);assert.equal(offer.reason,'complimentary_package');
  const due=await api.dueAccountBackfill.handler(f.ctx,{apiKey:'test-pipeline'});
  assert.deepEqual(due.map(r=>r.lessonId),[included]);assert.ok(!due.some(r=>r.lessonId===excluded));
});
test('gift analysis writes are idempotent and reject lesson outside package',async()=>{
  const f=await fixture({total:1}),id=await f.lesson(1),other=await f.lesson(2);await grant(f);
  const args={apiKey:'test-pipeline',studentId:f.studentId,lessonId:id,lessonSummary:'Checked analysis'};
  const first=await api.createAnalysis.handler(f.ctx,args),second=await api.createAnalysis.handler(f.ctx,args);
  assert.equal(first,second);assert.equal(f.db.rows('transcriptAnalyses').length,1);
  await assert.rejects(()=>api.createAnalysis.handler(f.ctx,{...args,lessonId:other}),/refused/);
});
test('ambiguous same-day bookings fail closed',async()=>{
  const f=await fixture(),id=await f.lesson(1);await f.lesson(1);await grant(f);
  assert.equal((await f.eligible(id)).reason,'ambiguous_booking');
});
