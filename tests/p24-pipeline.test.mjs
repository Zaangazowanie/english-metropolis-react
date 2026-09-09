// Offline execution of the real payment handlers; no network or production writes.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
const stub = `const pass=x=>x; export const action=pass,query=pass,mutation=pass,internalAction=pass,internalQuery=pass,internalMutation=pass,httpAction=pass;
const ref=p=>new Proxy(()=>{}, {get:(_,k)=>k==='__path'?p:ref(p?p+'.'+String(k):String(k))}); export const internal=ref(''),api=ref('');`;
const source = readFileSync('convex/http.ts','utf8');
const route = source.slice(source.indexOf('http.route({'), source.indexOf('// Shared-secret auth.'));
const bundled = await build({stdin:{contents:`export * from './convex/p24'; import {internal} from './convex/_generated/api'; import {p24Config,p24NotificationSign,verifyAtP24} from './convex/p24'; let statusHandler; const http={route:r=>statusHandler=r.handler}; const httpAction=x=>x; ${route} export {statusHandler};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'inert-builders',setup(b){b.onResolve({filter:/_generated\/(server|api)$/},()=>({path:'builders',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:stub,loader:'js'}));}}]});
let seq=0;
async function load(enabled){process.env.P24_RATY_ZERO_CONFIRMED=enabled?'true':'false'; return import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text+`\n// ${++seq}`).toString('base64'));}
Object.assign(process.env,{P24_MERCHANT_ID:'123',P24_POS_ID:'123',P24_API_KEY:'test-key',P24_CRC:'test-crc',P24_API_BASE:'https://p24.invalid',P24_REDIRECT_BASE:'https://p24.invalid',P24_STATUS_URL:'https://callback.invalid/p24/status'});
const methods=[{id:154,group:'Blik'},{id:241,group:'Credit Card'},{id:252,group:'Apple Pay'},{id:264,group:'Google Pay'},{id:299,group:'Visa Mobile'},{id:303,group:'Installments'},{id:317,group:'Installments'},{id:20,group:'FastTransfers'},{id:178,group:'TraditionalTransfer'}].map(m=>({...m,status:true}));
let currentMethods=methods, calls=[];
globalThis.fetch=async (url,options={})=>{calls.push({url:String(url),options});if(String(url).includes('/payment/methods/'))return Response.json({data:currentMethods});if(String(url).endsWith('/transaction/register'))return Response.json({data:{token:'test-token'}});if(String(url).endsWith('/transaction/verify'))return Response.json({data:true});throw Error('Unexpected fetch '+url);};
let P=await load(false);
const groups=(await P.listMethods.handler({}, {lang:'pl'})).groups;
assert.deepEqual(groups.map(g=>g.key),['blik','card','applepay','googlepay','visamobile','paypo','transfer']);
assert.equal(groups.find(g=>g.key==='card').methodId,241);
assert.equal(groups.find(g=>g.key==='transfer').count,1);
assert.equal(await P.installmentWidgetConfig.handler({}),null);
await assert.rejects(()=>P.createPayment.handler({}, {method:303}),/RATY_NOT_AVAILABLE/);
P=await load(true);
assert((await P.listMethods.handler({}, {lang:'pl'})).groups.some(g=>g.key==='installments'));
assert.equal((await P.installmentWidgetConfig.handler({})).method,'303');
currentMethods=methods.filter(m=>m.id!==303);
assert.equal(await P.installmentWidgetConfig.handler({}),null);
await assert.rejects(()=>P.createPayment.handler({}, {method:303,lang:'pl'}),/RATY_NOT_AVAILABLE/);
currentMethods=methods.map(m=>m.id===303?{...m,status:false}:m);
assert(!(await P.listMethods.handler({}, {lang:'pl'})).groups.some(g=>g.key==='installments'));
currentMethods=methods;
console.log('PASS live method grouping, wallets, disabled methods and both Raty gates');
P=await load(false);
for(const method of [241,252,264,299]){
 calls=[];const mutations=[];
 const ctx={runMutation:async(ref,args)=>{mutations.push({path:ref.__path,args});if(ref.__path==='p24.preparePayment')return {_id:'p1',status:'pending',sessionId:'session-test',amount:13500,currency:'PLN',email:'qa@example.invalid',lang:'pl',checkoutRef:'TEST'};}};
 const result=await P.createPayment.handler(ctx,{method,lang:'pl',billing:{fullName:'QA'},sessionToken:'test'});
 const payload=JSON.parse(calls.find(c=>c.url.endsWith('/register')).options.body);
 assert.equal(payload.method,method);assert.equal(payload.amount,13500);assert.equal(payload.regulationAccept,false);
 assert.equal(payload.sign,await P.sha384({sessionId:'session-test',merchantId:123,amount:13500,currency:'PLN',crc:'test-crc'}));
 assert.equal(mutations[0].args.requestedMethod,method);assert(!('method' in mutations[0].args));
 assert.equal(mutations[1].path,'p24.markRegistered');assert(result.redirectUrl.endsWith('/trnRequest/test-token'));
}
console.log('PASS card and wallet registration: chosen method, server price, signature, stored token and redirect');
const pay={_id:'p1',sessionId:'session-test',status:'registered',amount:13500,currency:'PLN',orderIds:['o1'],studentId:'s1'};
const order={_id:'o1',status:'payment_pending',organizationId:'org',studentId:'s1',packageName:'QA',lessons:1,priceLabel:'135 PLN',earlyPerformanceRequested:true};
const rows={p1:pay,o1:order};let allocated=0, notifications=0;
const db={query:()=>({withIndex:()=>({unique:async()=>pay})}),get:async id=>rows[id],patch:async(id,patch)=>Object.assign(rows[id],patch),insert:async(table,row)=>{assert.equal(table,'lessonPackages');allocated++;rows.pkg=row;return 'pkg';}};
const ctx={runQuery:async()=>pay,runMutation:async(ref,args)=>{assert.equal(ref.__path,'p24.finalizePaid');return P.finalizePaid.handler({db,scheduler:{runAfter:async()=>{notifications++;}}},args);}};
const body={merchantId:123,posId:123,sessionId:'session-test',amount:13500,originAmount:13500,currency:'PLN',orderId:987,methodId:241,statement:'QA'};
body.sign=await P.p24NotificationSign(body,'test-crc');
const req=b=>new Request('https://callback.invalid/p24/status',{method:'POST',body:JSON.stringify(b)});
assert.equal((await P.statusHandler(ctx,req({}))).status,400);
assert.equal((await P.statusHandler(ctx,req({...body,merchantId:999}))).status,403);
assert.equal((await P.statusHandler(ctx,req({...body,sign:'bad'}))).status,403);
const mismatch={...body,amount:100};mismatch.sign=await P.p24NotificationSign(mismatch,'test-crc');
assert.equal((await P.statusHandler(ctx,req(mismatch))).status,409);assert.equal(allocated,0);
const goodFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>String(url).endsWith('/transaction/verify')?new Response('{}',{status:503}):String(url).includes('/transaction/by/')?new Response('{}',{status:503}):goodFetch(url,opts);
assert.equal((await P.statusHandler(ctx,req(body))).status,502);assert.equal(allocated,0);
globalThis.fetch=goodFetch;
calls=[];assert.equal((await P.statusHandler(ctx,req(body))).status,200);
assert(calls.some(c=>c.url.endsWith('/transaction/verify')));assert.equal(allocated,1);assert.equal(order.status,'confirmed');assert.equal(pay.status,'paid');assert.equal(notifications,1);
assert.equal((await P.statusHandler(ctx,req(body))).status,200);assert.equal(allocated,1);assert.equal(notifications,1);
console.log('PASS webhook rejects malformed/forged/mismatched data; verifies P24 before allocation; replay grants no duplicate lessons or email');

// Exercise the real catalogue and payment mutation with an in-memory database.
// Display totals must not be the authority for the amount sent to Przelewy24.
async function prepare(items, options={}) {
 const student={_id:'buyer',organizationId:'org',status:'active',isMinor:!!options.minor};
 const saved={buyer:student}; const inserts=[];
 const session={kind:'student',studentId:'buyer',expiresAt:Date.now()+60_000};
 const database={
  query:table=>({withIndex:()=>({unique:async()=>table==='authSessions'?session:table==='priceQuotes'?options.quote:null,collect:async()=>[]})}),
  get:async id=>saved[id],
  insert:async(table,row)=>{const id=`saved-${inserts.length}`;saved[id]={_id:id,...row};inserts.push({table,...row});return id;},
  patch:async(id,patch)=>Object.assign(saved[id],patch),
 };
 const args={sessionToken:'test-session',sessionId:'new-session',checkoutRef:'QA-ANALYSIS',items,billing:{fullName:'Test Buyer',email:'qa@example.invalid'},lang:'en',consentTerms:true,consentImmediate:false,consentMarketing:false,analysisAddon:true,consentAnalysis:true,...options.args};
 const payment=await P.preparePayment.handler({db:database},args);
 return {payment,inserts};
}
for(const [id,expected,quantity] of [['single',15500,1],['private-core',54000,1],['momentum',100000,1],['fluency-48',456000,1],['single',62000,4],['private-core',108000,2]]){
 const {payment}=await prepare([{packageId:id,qty:quantity}]);
 assert.equal(payment.amount,expected,`${id} x ${quantity}`);assert.equal(payment.consentAnalysis,true);
}
assert.equal((await prepare([{packageId:'single',qty:2},{packageId:'private-core',qty:1}])).payment.amount,85000);
assert.equal((await prepare([{packageId:'private-core',qty:1}],{args:{analysisAddon:false,consentAnalysis:false}})).payment.amount,48000);
await assert.rejects(()=>prepare([{packageId:'private-core',qty:1}],{args:{consentAnalysis:false}}),/ANALYSIS_CONSENT_REQUIRED/);
await assert.rejects(()=>prepare([{packageId:'private-core',qty:1}],{minor:true}),/ANALYSIS_NOT_AVAILABLE_FOR_MINORS/);
await assert.rejects(()=>prepare([{packageId:'private-core',qty:1}],{args:{forChild:true}}),/ANALYSIS_NOT_AVAILABLE_FOR_MINORS/);
await assert.rejects(()=>prepare([{packageId:'invented-cheap-package',qty:1}]),/Invalid cart item/);
await assert.rejects(()=>prepare([{packageId:'private-core',qty:0}]),/Invalid cart item/);
const quote={quoteRef:'offer',studentId:'buyer',status:'open',expiresAt:Date.now()+60_000,amount:2000,label:'One lesson analysis',kind:'analysis',grantAnalysisScope:'lesson'};
assert.equal((await prepare([],{quote,args:{quoteRef:'offer',analysisAddon:false}})).payment.amount,2000);
await assert.rejects(()=>prepare([],{quote,args:{quoteRef:'offer',analysisAddon:false,consentAnalysis:false}}),/ANALYSIS_CONSENT_REQUIRED/);
console.log('PASS AI package discount, single/mixed quantities, opt-out, consent, minors, invalid products and unchanged upgrade quotes');
