const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {tmpdir}=require('node:os');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const {digest}=require('../../api/_bundle');
const {createPlan,approvePlan,validatePlan,coverage}=require('../../api/_evaluation');
const planRoute=require('../../api/evaluation-plan');
const preflight=require('../../api/evaluation-preflight');
const execute=require('../../api/evaluation-case');
const {bundleFiles}=require('../../api/_export');
const metrics=require('../../evaluation-metrics');
const {simulateJD}=require('../../api/_simulation');
const source=readFileSync(require('node:path').join(__dirname,'../../app.js'),'utf8');
const {files}=vm.runInNewContext(source.split('let files=')[0]+';({files:SAMPLE})');
function analysis(){
 const rules=files.map((file,i)=>({id:'R'+(i+1),file:file.name,line:1,quote:file.content,workflows:[file.name==='refunds.md'?'refund':file.name==='cancellations.md'?'cancellation':file.name==='profile.md'?'profile':'shared']}));
 const a={rules,modules:Object.fromEntries(['shared','refund','cancellation','profile'].map(name=>[name,rules.filter(rule=>rule.workflows.includes(name)).map(rule=>rule.id)])),model:'muse-spark-1.3',usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}};
 a.sha256=digest(files,a);return a;
}
async function post(handler,body){const response={status(code){this.code=code;return this;},setHeader(){return this;},json(data){this.data=data;return this;},end(data){this.data=data;return this;}};await handler({method:'POST',body},response);return response;}
function setup(t,{answers=[{action:'eligible'}],input=80,partialAt=-1}={}){
 const original=process.env.META_API_KEY;process.env.META_API_KEY='local-evaluation-double';
 t.after(()=>{if(original===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=original;});
 const calls=[];let generations=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});
  if(url.endsWith('/responses/input_tokens'))return {ok:true,json:async()=>({input_tokens:typeof input==='function'?input(body):input})};
  assert(url.endsWith('/chat/completions'));assert.equal(body.reasoning_effort,'minimal');assert.equal(body.max_completion_tokens,750);
  const answer=answers[generations],partial=generations++===partialAt;assert(answer,'Unexpected generation');
  return {ok:true,json:async()=>({model:'muse-spark-1.3',choices:[{finish_reason:partial?'length':'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:10},completion_tokens_details:{reasoning_tokens:5}}})};
 });return calls;
}
function request(a,plan,overrides={}){return {files,analysis:a,plan,caseId:'T01',repetition:1,mode:'candidate',remainingTokens:plan.budgetLimit,...overrides};}

test('reviewed plans bind source, candidate, expectations and repetitions independently',async()=>{
 const a=analysis(),draft=createPlan(files,a);
 assert.equal(draft.cases.length,9);assert.equal(draft.cases.filter(c=>c.enabled).length,6);assert.equal(draft.approved,false);
 assert.throws(()=>validatePlan(draft,files,a),/approve/);
 const approved=approvePlan({...draft,repetitions:2},files,a);
 assert.equal(approved.approved,true);assert.notEqual(approved.sha256,draft.sha256);assert.equal(draft.approved,false);
 const changed=structuredClone(approved);changed.cases[0].expected='ineligible';
 assert.throws(()=>validatePlan(changed,files,a),/exact test plan/);
 assert.throws(()=>validatePlan(approved,files,{...a,sha256:'different'}));
 assert(coverage(approved,a).uncoveredRuleIds.includes('R1'));
 const route=await post(planRoute,{action:'approve',files,analysis:a,plan:draft});assert.equal(route.code,200);assert(route.data.plan.approved);
});

test('approval rejects invented rule coverage, unsafe identifiers and unbounded runs',()=>{
 const a=analysis();
 for(const change of [p=>p.repetitions=4,p=>p.budgetLimit=300001,p=>p.cases[0].ruleIds=['R999'],p=>p.cases[0].ruleIds=[],p=>p.cases[0].id='1 bad',p=>p.cases[0].expectedState={unknownFlag:true}]){
  const p=createPlan(files,a);change(p);assert.throws(()=>approvePlan(p,files,a));
 }
});

test('preflight sizes every selected case and repetition, with a bounded lookup reserve',async t=>{
 const a=analysis(),draft=createPlan(files,a);draft.repetitions=2;
 const plan=approvePlan(draft,files,a),calls=setup(t,{input:body=>JSON.stringify(body.input).length});
 const out=await post(preflight,{files,analysis:a,plan});
 assert.equal(out.code,200);assert.equal(out.data.requests.length,12);assert.equal(out.data.generationCallsMax,28);
 assert(out.data.reservedTokens>out.data.baselineInitialInput+out.data.candidateInitialInput);
 assert(calls.every(call=>call.url.endsWith('/input_tokens')));
 assert.equal(calls.length,12);
});

test('a too-small remaining allowance stops before generation',async t=>{
 const a=analysis(),plan=approvePlan(createPlan(files,a),files,a),calls=setup(t);
 const out=await post(execute,request(a,plan,{remainingTokens:1}));
 assert.equal(out.code,200);assert.equal(out.data.status,'incomplete');assert.equal(out.data.code,'BUDGET_STOP');assert.equal(out.data.measurement.calls.length,0);
 assert(calls.every(call=>call.url.endsWith('/input_tokens')));
});

test('classification produces complete usage receipts without leaking the expected oracle',async t=>{
 const a=analysis(),plan=approvePlan(createPlan(files,a),files,a),calls=setup(t);
 const out=await post(execute,request(a,plan));
 assert.equal(out.code,200);assert.equal(out.data.pass,true);assert.equal(out.data.usage.total_tokens,120);
 assert.equal(out.data.measurement.calls[0].usage.completion_tokens_details.reasoning_tokens,5);
 assert.equal(out.data.measurement.routingProviderCalls,0);
 const generation=calls.find(call=>call.url.endsWith('/chat/completions'));
 assert.equal(generation.body.messages[1].content,plan.cases[0].query);
 assert(!generation.body.messages.some(message=>message.content.includes('expectedState')));
});

test('a bounded simulated lookup counts both calls and preserves incomplete second-call usage',async t=>{
 const a=analysis(),plan=approvePlan(createPlan(files,a),files,a);
 const calls=setup(t,{answers:[{action:'lookup_event_status',event_id:'EV-7'},{action:'eligible'}],partialAt:1});
 const out=await post(execute,request(a,plan,{caseId:'T04'}));
 assert.equal(out.data.status,'incomplete');assert.equal(out.data.pass,null);assert.equal(out.data.usage.total_tokens,240);
 assert.equal(out.data.measurement.calls.length,2);assert.equal(out.data.measurement.calls[1].status,'incomplete');
 assert.equal(out.data.toolCalls[0].executed,true);assert.equal(calls.filter(call=>call.url.endsWith('/chat/completions')).length,2);
});

test('an unexpected lookup is a recorded behavioral failure, not an automatic fix',async t=>{
 const a=analysis(),before=JSON.stringify(a),plan=approvePlan(createPlan(files,a),files,a);
 setup(t,{answers:[{action:'lookup_event_status',event_id:'wrong'}]});
 const out=await post(execute,request(a,plan));
 assert.equal(out.data.status,'completed');assert.equal(out.data.pass,false);assert.equal(out.data.toolCalls[0].executed,false);
 assert.equal(JSON.stringify(a),before);assert.equal(out.data.measurement.calls.length,1);
});

test('holdout modal assertions run against isolated state instead of a hardcoded case ID',()=>{
 const test={id:'H03',query:'Dismiss the panel',context:{jd_viewer_open:true,jd_evaluation_results_modal_open:true},assertions:{evaluationOpen:false,jdOpen:true}};
 const out=simulateJD(test,{intent:'close_published_jd_applicant_evaluation_results'});
 assert.equal(out.passed,true);assert.equal(out.assertions.length,2);assert.equal(out.finalState.jdOpen,true);
});

test('price estimation subtracts cached input and does not double-charge reasoning',()=>{
 const usage={prompt_tokens:1000000,completion_tokens:500000,prompt_tokens_details:{cached_tokens:200000},completion_tokens_details:{reasoning_tokens:100000}};
 assert.equal(metrics.charge(usage,'muse-spark-1.3'),3.155);
 assert.equal(metrics.charge({},'muse-spark-1.3'),null);
 assert.equal(metrics.charge(usage,'unknown-model'),null);
 assert.equal(metrics.charge({...usage,prompt_tokens_details:{cached_tokens:1000001}},'muse-spark-1.3'),null);
});

function completed(mode,input,pass=true){return {status:'completed',pass,mode,latencyMs:100,measurement:{calls:[{mode,model:'muse-spark-1.3',status:'completed',usageKnown:true,usage:{prompt_tokens:input,completion_tokens:20,total_tokens:input+20}}]}};}
test('adoption requires complete behavior and cost evidence; retries and failures remain counted',()=>{
 const a=analysis(),draft=createPlan(files,a);draft.cases=draft.cases.slice(0,1);const plan=approvePlan(draft,files,a);
 const row={case:plan.cases[0],baseline:{...completed('baseline',1000),snapshot:a.sha256,planHash:plan.sha256},candidate:{...completed('candidate',100),snapshot:a.sha256,planHash:plan.sha256},attempts:[]};
 let out=metrics.summarize(a,plan,[row]);assert.equal(out.decision,'eligible-for-review');assert(out.breakEvenRequests>0);
 row.attempts.push({...completed('candidate',200),status:'incomplete',pass:null});out=metrics.summarize(a,plan,[row]);assert.equal(out.candidate.totalTokens,340);assert.equal(out.candidate.retries,1);
 row.attempts.push({mode:'candidate',status:'incomplete',measurement:{calls:[{mode:'candidate',model:'muse-spark-1.3',usageKnown:false,usage:{}}]}});
 out=metrics.summarize(a,plan,[row]);assert.equal(out.decision,'cost-unverified');assert.equal(out.candidate.costUSD,null);assert.equal(out.breakEvenRequests,null);
 row.candidate.pass=false;assert.equal(metrics.summarize(a,plan,[row]).decision,'do-not-adopt');
});

test('exports retain the exact approved plan, metrics and reviewed cases',()=>{
 const a=analysis(),plan=approvePlan(createPlan(files,a),files,a),bundle=bundleFiles(a,[],files,plan);
 assert.equal(JSON.parse(bundle['test-plan.json']).sha256,plan.sha256);
 assert.equal(JSON.parse(bundle['measurements.json']).planHash,plan.sha256);
 assert.equal(JSON.parse(bundle['cases.json']).length,6);
});

test('failed legacy rule validation retains the optimizer call usage',async t=>{
 const original=process.env.META_API_KEY;process.env.META_API_KEY='analysis-test-double';
 t.after(()=>{if(original===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=original;});
 t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({model:'muse-spark-1.3',choices:[{finish_reason:'stop',message:{content:'{"rules":[]}'}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}})}));
 const response=await post(require('../../api/analyze'),{files,algorithm:'legacy'});
 assert.equal(response.code,500);assert.equal(response.data.providerAttempted,true);assert.equal(response.data.usage.total_tokens,120);
});

test('a result from another plan cannot satisfy the current adoption gate',()=>{
 const a=analysis(),draft=createPlan(files,a);draft.cases=draft.cases.slice(0,1);const plan=approvePlan(draft,files,a);
 const row={case:plan.cases[0],baseline:{...completed('baseline',1000),snapshot:a.sha256,planHash:'old-plan'},candidate:{...completed('candidate',10),snapshot:a.sha256,planHash:plan.sha256}};
 const out=metrics.summarize(a,plan,[row]);assert.equal(out.complete,false);assert.equal(out.decision,'incomplete');assert(out.bindingErrors.length);
});

test('reviewed legacy exports reproduce the exact sample requests, including multiline corrections',()=>{
 const {revise}=require('../../api/_review'),{prepare}=require('../../api/_evaluation');
 let a=analysis();a=revise(files,a,{text:{R2:a.rules[1].quote+'\r\nKeep the original identifiers.\n'}});
 const plan=approvePlan(createPlan(files,a),files,a),output=bundleFiles(a,[],files,plan);
 const directory=mkdtempSync(join(tmpdir(),'promptimize-evaluation-'));
 try{
  for(const [name,content]of Object.entries(output)){const path=join(directory,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content);}
  for(const scenario of plan.cases.filter(test=>test.enabled))for(const mode of ['baseline','candidate']){
   const dry=JSON.parse(execFileSync('python3',['run.py','--case',scenario.id,'--mode',mode,'--dry-run'],{cwd:directory,encoding:'utf8'}));
   assert.deepEqual(dry.messages,prepare(files,a,scenario,mode).messages,scenario.id+' '+mode);
   assert.equal(dry.generation_started,false);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('trace celebration requires both correct completed current runs and matching complete state',()=>{
 const result=state=>({status:'completed',pass:true,snapshot:'snap',planHash:'plan',simulation:{passed:true,finalState:state}});
 const row={baseline:result({workspace:'jd',open:true}),candidate:result({open:true,workspace:'jd'})};
 assert.equal(metrics.traceMatches(row,'snap','plan'),true);
 for(const changed of [
  {...row.candidate,pass:false},
  {...row.candidate,status:'incomplete'},
  {...row.candidate,snapshot:'old'},
  {...row.candidate,planHash:'old-plan'},
  {...row.candidate,simulation:{passed:false,finalState:{workspace:'jd',open:true}}},
  result({workspace:'jd',open:false}),result({})
 ])assert.equal(metrics.traceMatches({...row,candidate:changed},'snap','plan'),false);
 assert.equal(metrics.traceMatches({baseline:{...row.baseline,pass:false},candidate:{...row.candidate,pass:false}},'snap','plan'),false);
});

test('budget classification distinguishes a real shortfall from the supplied near-limit example',()=>{
 assert.equal(metrics.budgetState(44548,45000).kind,'tight');assert.equal(metrics.budgetState(44548,45000).difference,452);
 assert.equal(metrics.budgetState(44548,40000).kind,'insufficient');assert.equal(metrics.budgetState(44548,40000).difference,-4548);
 assert.equal(metrics.budgetState(1000,10000).kind,'ready');assert.equal(metrics.budgetState(-1,100),null);
});
