const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../../api/architecture-image');
const {digest}=require('../../api/_bundle');
const files=[{name:'rules.md',content:'Refund requests require booking confirmation. Profile viewing must not save changes.'}];
function candidate(){const a={rules:[{id:'R1',file:'rules.md',line:1,quote:files[0].content,workflows:['shared']}],modules:{shared:['R1']}};a.sha256=digest(files,a);return a;}
async function post(body){const r={status(n){this.code=n;return this;},setHeader(){return this;},json(value){this.data=value;return this;}};await handler({method:'POST',body},r);return r;}
function provider(t){const prev=process.env.META_API_KEY;process.env.META_API_KEY='image-test-only';t.after(()=>{if(prev===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=prev;});const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({data:[{url:'https://example.invalid/diagram.png'}],created:123})};});return calls;}
test('loaded promptbase files generate one labeled image preview without analysis, context or a design pass',async t=>{
 const calls=provider(t),r=await post({files});assert.equal(r.code,200);assert.equal(r.data.basis,'source-preview');assert.equal(r.data.snapshot,null);assert.match(r.data.note,/not a verified refactor/);assert.equal(calls.length,1);assert.equal(calls[0].body.model,'muse-image-1.0');assert(calls[0].url.endsWith('/images/generations'));assert(calls[0].body.prompt.includes('rules.md'));assert(calls[0].body.prompt.includes('booking confirmation'));
});
test('an analyzed promptbase can generate an image without project context or an architecture report',async t=>{
 const calls=provider(t),analysis=candidate(),before=JSON.stringify(analysis),r=await post({files,analysis});assert.equal(r.code,200);assert.equal(r.data.basis,'analyzed-promptbase');assert.equal(r.data.snapshot,analysis.sha256);assert.equal(calls.length,1);assert(calls[0].body.prompt.includes('shared'));assert.equal(JSON.stringify(analysis),before);
});
test('stale candidates and invalid architecture reports are refused before any image charge',async t=>{
 const calls=provider(t);const stale=await post({files,analysis:{...candidate(),sha256:'stale'}});assert.equal(stale.code,409);const invalid=await post({files,analysis:candidate(),report:{snapshot:'stale'}});assert.notEqual(invalid.code,200);assert.equal(calls.length,0);const empty=await post({files:[]});assert.equal(empty.code,400);assert.equal(calls.length,0);
});
