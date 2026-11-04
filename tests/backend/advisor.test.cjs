const test=require('node:test');
const assert=require('node:assert/strict');
const {digest}=require('../../api/_bundle');
const {normalizeContext}=require('../../api/_semantic-context');
const {contextFiles,validateFacts,factsToContext,bounded,projection,architecture,kit,modelFor}=require('../../api/_advisor');
const docs=[{name:'docs/project.md',content:'The assistant manages event refunds. Never cancel without confirmation.'}];
const files=[{name:'rules.md',content:'Always verify ownership.\n\nRefunds take 14 days.\n\nNever cancel without confirmation.'}];
function candidate(){const a={rules:[{id:'R1',file:'rules.md',line:1,quote:'Always verify ownership.',workflows:['shared']},{id:'R2',file:'rules.md',line:3,quote:'Refunds take 14 days.',workflows:['refund']},{id:'R3',file:'rules.md',line:5,quote:'Never cancel without confirmation.',workflows:['cancellation']}],modules:{shared:['R1'],refund:['R2'],cancellation:['R3']}};a.sha256=digest(files,a);return a;}
const factsValue={facts:[{kind:'purpose',text:'Help with refunds.',file:'docs/project.md',quote:'The assistant manages event refunds.'},{kind:'invariant',text:'Ask for cancellation confirmation.',file:'docs/project.md',quote:'Never cancel without confirmation.'}]};
function context(){return factsToContext(validateFacts(factsValue,docs),'Event assistant',true);}
function plan(){return {summary:'Keep shared rules and load the selected workflow.',techniques:[{id:'selective-loading',status:'recommend',title:'Load only relevant rules',why:'Ownership applies to all requests.',implementation:'Use the approved workflow in the loader.',risk:'An incorrect route can omit an exception.',validation:'Check cancellation confirmation and refund boundaries.',evidence:['R1','R3']}],files:[{path:'templates/project_adapter.py',content:'def build_context(intent):\n    return {"intent": intent}\n'}]};}

test('context upload rejects traversal, hidden files, duplicate names, empty input and byte overruns',()=>{
 assert.equal(contextFiles(docs).length,1);
 for(const value of [[{name:'../x.md',content:'x'}],[{name:'.secrets.json',content:'x'}],[...docs,...docs],[{name:'x.md',content:' '}],[{name:'x.md',content:'界'.repeat(14000)}]])assert.throws(()=>contextFiles(value));
});
test('context facts require literal source evidence and reviewed authority',()=>{
 const facts=validateFacts(factsValue,docs);
 assert.equal(facts[1].source.line,1);
 assert.throws(()=>validateFacts({facts:[{...factsValue.facts[0],quote:'Invented text'}]},docs));
 assert.throws(()=>validateFacts({facts:[{...factsValue.facts[0],kind:'prompt',promptFile:'private.py'}]},docs,[]));
 const draft=normalizeContext(factsToContext(facts),files);assert.equal(draft.brief,'');
 const approved=normalizeContext(context(),files);assert(approved.brief.includes('Ask for cancellation confirmation.'));
});
test('budget is checked before generation and failures preserve known usage',async()=>{
 let calls=0;
 await assert.rejects(bounded([],{budget:1000,maxOutput:600,counter:async()=>500,provider:async()=>{calls++;}}),/No generation started/);
 assert.equal(calls,0);
 const usage={total_tokens:33};
 await assert.rejects(bounded([],{counter:async()=>2,provider:async()=>{throw Object.assign(Error('failed'),{providerUsage:usage});}}),e=>e.providerAttempted&&e.providerUsage===usage);
});
test('projection discloses assumptions and full fallback can increase input cost',()=>{
 const a=candidate(),base=projection(files,a,{fallbackRate:0}),fallback=projection(files,a,{fallbackRate:1});
 assert.equal(base.measured,false);assert(base.inputSavingsPercent>0);assert(fallback.inputSavingsPercent<0);
 assert.equal(fallback.expectedInputTokens,Math.ceil((fallback.compactChars+fallback.broadChars)/4));
 assert.throws(()=>projection(files,a,{fallbackRate:NaN}));
 assert.throws(()=>projection(files,{...a,sha256:'wrong'}));
});
test('model selection is scoped to design passes and uses Wonder only when selected or Auto threshold is met',()=>{
 assert.equal(modelFor(undefined,200).model,'muse-spark-1.3');
 assert.equal(modelFor('auto',79).model,'muse-spark-1.3');
 assert.equal(modelFor('auto',80).model,'muse-wonder-1.0');
 assert.throws(()=>modelFor('untrusted-model'));
});
test('a generated plan cannot mutate the candidate; kit validates snapshot, context and paths',async()=>{
 const a=candidate(),before=JSON.stringify(a),ctx=context();
 const result=await architecture({files,analysis:a,...ctx,modelChoice:'wonder'},{counter:async()=>10,provider:async(_messages,_cap,options)=>{assert.equal(options.model,'muse-wonder-1.0');return {value:plan(),model:options.model,usage:{total_tokens:20}};}});
 assert.equal(JSON.stringify(a),before);
 const output=kit(result,a,files,ctx);assert(output['templates/project_adapter.py']);assert(output['flow.svg'].includes('still unresolved'));
 assert.throws(()=>kit({...result,snapshot:'wrong'},a,files,ctx),/different candidate/);
 assert.throws(()=>kit(result,a,files,{...ctx,projectContext:{...ctx.projectContext,purpose:'Different'}}),/context changed/);
 assert.throws(()=>kit({...result,files:[{path:'../loader.py',content:'pass'}]},a,files,ctx),/templates/);
 assert.throws(()=>kit({...result,techniques:[{...result.techniques[0],evidence:['R404']}]},a,files,ctx),/evidence/);
});
test('unapproved context blocks planning before any Meta request',async()=>{
 let calls=0;
 await assert.rejects(architecture({files,analysis:candidate(),...factsToContext(validateFacts(factsValue,docs))},{counter:async()=>{calls++;return 1;}}),/approve/);
 assert.equal(calls,0);
});
test('input sizing and generation both use the explicitly selected Meta model',async t=>{
 const previous=process.env.META_API_KEY;process.env.META_API_KEY='test-only';t.after(()=>{if(previous===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=previous;});
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:true,json:async()=>url.endsWith('input_tokens')?{input_tokens:20}:{choices:[{message:{content:'{}'}}],model:body.model,usage:{total_tokens:21}}};});
 const result=await bounded([],{model:'muse-wonder-1.0'});assert.equal(result.receipt.model,'muse-wonder-1.0');assert(calls.every(x=>x.model==='muse-wonder-1.0'));assert.equal(calls.length,2);
});
