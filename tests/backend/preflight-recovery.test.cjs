const test=require('node:test'),assert=require('node:assert/strict');
const {proposeSemantic}=require('../../api/_semantic-analysis');
const {digest}=require('../../api/_bundle');
const {revise}=require('../../api/_review');
const {identifyConflicts}=require('../../api/_semantic-conflicts');
const preflight=require('../../api/preflight'),runCase=require('../../api/run-case');
const sample=require('../../api/_sample-test');
const view=require('../../preflight-ui');
const {bundleFiles}=require('../../api/_export');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const files=[
 {name:'shared.md',content:'Ask before changing a booking. Do not invent identifiers.'},
 {name:'refunds.md',content:'Purchases at 14 days or less are eligible. Older purchases are not eligible.\n\nWhen `event_status` is `unknown`, use lookup_event_status.\n\nWhen `event_status` is `organizer_cancelled`, the refund is eligible regardless of purchase age.'},
 {name:'cancellations.md',content:'A cancellation needs the booking ID and owner confirmation. Checking cancellation eligibility never changes a booking.'},
 {name:'profile.md',content:'A view request must show the profile without saving. Before saving a change, display the old and new values and ask for confirmation.'},
 {name:'router.txt',content:'The old loader loads all files for every request. This architecture note is retained but need not be used for every workflow.'}
];
async function analysis(){
 const provider=async messages=>({value:{rules:JSON.parse(messages[1].content).sections.map((s,i)=>{
  const field=s.text.includes('`event_status`'),value=s.text.includes('`unknown`')?'unknown':'organizer_cancelled';
  return {key:'rule'+i,startSectionId:s.id,actor:'assistant',scope:s.file,action:'Follow the complete source instruction.',conditions:field?[{field:'event_status',op:'eq',value}]:[],assignments:[{workflow:s.file==='shared.md'?'shared':s.file==='refunds.md'?'refund':s.file==='profile.md'?'profile':s.file==='cancellations.md'?'cancellation':'shared',conditions:[],rationale:'The source file names this workflow.'}]};
 }),relations:[],reviewItems:[]},usage:{total_tokens:0}});
 return proposeSemantic(files,{}, {provider,limits:{maxPairs:0}});
}
async function post(handler,body){const r={headers:{},status(x){this.code=x;return this;},setHeader(k,v){this.headers[k]=v;return this;},json(x){this.data=x;return this;},end(x){this.data=x;return this;}};await handler({method:'POST',body},r);return r;}
function provider(t,answers=[]){
 const previous=process.env.META_API_KEY;process.env.META_API_KEY='fixture-only';t.after(()=>{if(previous===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=previous;});
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const body=JSON.parse(options.body);requests.push({url,body});
  if(url.endsWith('/responses/input_tokens'))return {ok:true,json:async()=>({input_tokens:Math.ceil(JSON.stringify(body.input).length/4)})};
  assert(answers.length,'Unexpected model generation');const answer=answers.shift();
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(answer)}}],model:'muse-spark-1.3',usage:{prompt_tokens:30,completion_tokens:10,total_tokens:40}})};
 });return requests;
}
test('reproduces the old missing-state block without pretending partial sizing is zero',async t=>{
 const a=await analysis();const requests=provider(t);
 const r=await post(preflight,{files,analysis:a,testSetups:{T04:{context:{},followupContext:{}}}});
 assert.equal(r.code,200);assert.equal(r.data.canRun,false);assert.equal(r.data.inputSizingComplete,false);
 assert.equal(r.data.candidateInitialInput,null);assert.equal(r.data.reservedTokens,null);
 assert(r.data.blockers.some(b=>b.caseId==='T04'&&b.field==='event_status'&&b.evidence.some(e=>e.file==='refunds.md')));
 assert(requests.every(x=>x.url.endsWith('/responses/input_tokens')));
 const html=view.budgetMarkup(r.data);assert(html.includes('Missing field:'));assert(html.includes('event_status'));assert(html.includes('T04'));assert(!html.includes('candidate 0'));
});
test('default sample facts resolve all six cases and the lookup follow-ups without changing a frozen candidate',async t=>{
 const a=await analysis(),frozen=JSON.stringify(a);const requests=provider(t);
 const r=await post(preflight,{files,analysis:a});
 assert.equal(r.code,200);assert.equal(r.data.canRun,true,JSON.stringify(r.data.blockers));
 assert.equal(r.data.caseChecks.length,14);assert.equal(new Set(r.data.caseChecks.map(c=>c.caseId)).size,6);
 assert(r.data.caseChecks.every(c=>c.ready));assert.equal(requests.length,14);
 assert.equal(JSON.stringify(a),frozen);
 assert.equal(r.data.reservedTokens,r.data.baselineInitialInput+r.data.candidateInitialInput+14*750);
});
test('reviewed plans retain missing-state recovery, repetition reserves and exact follow-up requests',async t=>{
 const {createPlan,approvePlan}=require('../../api/_evaluation');
 const reviewedPreflight=require('../../api/_evaluation-preflight'),reviewedRun=require('../../api/_evaluation-case');
 const a=await analysis(),original=JSON.stringify(a),requests=provider(t,[sample.LOOKUP,{action:'eligible'}]);
 const draft=createPlan(files,a);draft.repetitions=2;draft.budgetLimit=100000;
 const broken=structuredClone(draft);broken.cases.find(c=>c.id==='T04').followupContext={};
 const blocked=await post(reviewedPreflight,{files,analysis:a,plan:approvePlan(broken,files,a)});
 assert.equal(blocked.data.canRun,false);assert.equal(blocked.data.reservedTokens,null);
 assert(blocked.data.blockers.some(b=>b.caseId==='T04'&&b.stage==='followup'&&b.field==='event_status'));
 assert(requests.every(x=>x.url.endsWith('/input_tokens')));
 requests.length=0;
 const plan=approvePlan(draft,files,a),sized=await post(reviewedPreflight,{files,analysis:a,plan});
 assert.equal(sized.data.canRun,true,JSON.stringify(sized.data.blockers));
 assert.equal(sized.data.generationCallsMax,28);assert.equal(requests.length,14);
 assert.equal(sized.data.reservedTokens,sized.data.requests.reduce((n,r)=>n+r.reservedTokens*2,0));
 const counted=requests.map(x=>JSON.stringify(x.body.input));
 const result=await post(reviewedRun,{files,analysis:a,plan,caseId:'T04',mode:'candidate',repetition:1,remainingTokens:plan.budgetLimit});
 assert.equal(result.data.pass,true);assert.equal(result.data.measurement.calls.length,2);
 const generations=requests.filter(x=>x.url.endsWith('/chat/completions'));
 assert.equal(generations.length,2);assert(generations.every(x=>counted.includes(JSON.stringify(x.body.messages))));
 assert(!generations[0].body.messages[0].content.includes('the refund is eligible regardless'));
 assert(generations[1].body.messages[0].content.includes('the refund is eligible regardless'));
 assert.equal(JSON.stringify(a),original);
});
test('the full suite allowance can be explicitly increased while the per-call guard stays enforced',async t=>{
 const a=await analysis();provider(t);
 const blocked=await post(preflight,{files,analysis:a,comparisonBudget:1000});assert.equal(blocked.data.canRun,false);assert(blocked.data.blockers.some(b=>b.code==='suite-budget-exceeded'));
 const ready=await post(preflight,{files,analysis:a,comparisonBudget:30000});assert.equal(ready.data.canRun,true);
 const invalid=await post(preflight,{files,analysis:a,comparisonBudget:300001});assert.equal(invalid.code,400);
});
test('preflight sizes the exact requests later generated, including newly selected post-lookup context',async t=>{
 const a=await analysis(),requests=provider(t,[sample.LOOKUP,{action:'eligible'}]);
 const sized=await post(preflight,{files,analysis:a});assert(sized.data.canRun);
 const counted=requests.map(x=>JSON.stringify(x.body.input));
 const c=sample.cases().find(x=>x.id==='T04');
 const r=await post(runCase,{files,analysis:a,test:c,mode:'candidate',caseFingerprint:sized.data.caseBindings.T04});
 assert.equal(r.data.status,'completed');assert.equal(r.data.pass,true);assert.equal(r.data.toolCalls.length,1);
 const generations=requests.filter(x=>x.url.endsWith('/chat/completions'));assert.equal(generations.length,2);
 assert(generations.every(g=>counted.includes(JSON.stringify(g.body.messages))));
 assert(JSON.parse(generations[0].body.messages[1].content).request_context.event_status==='unknown');
 assert(JSON.parse(generations[1].body.messages[1].content).request_context.event_status==='organizer_cancelled');
 assert(!generations[0].body.messages[0].content.includes('the refund is eligible regardless'));
 assert(generations[1].body.messages[0].content.includes('the refund is eligible regardless'));
});
test('a changed test state invalidates the checked request before generation',async t=>{
 const a=await analysis(),requests=provider(t);const c=sample.cases()[0],fingerprint=sample.hash(c);
 const r=await post(runCase,{files,analysis:a,test:{...c,context:{...c.context,event_status:'unknown'}},mode:'candidate',caseFingerprint:fingerprint});
 assert.equal(r.code,409);assert.equal(requests.length,0);
});
test('real source conflicts remain blocked until an explicit source-backed human decision',async t=>{
 const a=await analysis(),left=a.rules.find(r=>r.file==='refunds.md'),right=a.rules.find(r=>r.file==='cancellations.md');
 a.semantic.reviewItems=identifyConflicts([...a.semantic.reviewItems,{type:'contradiction',ruleIds:[left.id,right.id],evidence:[left.sources[0].id,right.sources[0].id],rationale:'Synthetic false-positive report for explicit human review.'}]);a.sha256=digest(files,a);
 const original=JSON.stringify(a);provider(t);
 const blocked=await post(preflight,{files,analysis:a});assert.equal(blocked.data.canRun,false);assert(blocked.data.blockers.some(b=>b.code==='contradiction'));
 const item=a.semantic.reviewItems.find(x=>x.type==='contradiction');
 const reviewed=revise(files,a,{conflictResolutions:[{conflictId:item.id,action:'dismiss-false-positive',rationale:'The refund policy and cancellation confirmation have different effects and do not contradict.',evidence:[left.sources[0].id,right.sources[0].id]}]});
 const ready=await post(preflight,{files,analysis:reviewed});assert.equal(ready.data.canRun,true,JSON.stringify(ready.data.blockers));assert.equal(JSON.stringify(a),original);
});
test('ordinary policy nouns cannot create invented executable state requirements',async()=>{
 const f=[{name:'rules.md',content:'When cancellation status is unknown, look up the event status before deciding.'}];
 const a=await proposeSemantic(f,{}, {limits:{maxPairs:0},provider:async messages=>({value:{rules:[{key:'refund',startSectionId:JSON.parse(messages[1].content).sections[0].id,actor:'assistant',scope:'refund',action:'Check status',conditions:[{field:'status',op:'eq',value:'unknown'}],assignments:[{workflow:'refund',conditions:[],rationale:'Refund workflow'}]}],relations:[],reviewItems:[]}})});
 assert(a.rules.every(r=>!r.conditions.length));assert(a.semantic.reviewItems.some(x=>x.type==='condition-unresolved'));assert(a.rules.some(r=>r.quote===f[0].content));
});
test('blocked views escape source content and distinguish budget failures from missing state',()=>{
 const html=view.budgetMarkup({canRun:false,inputSizingComplete:true,baselineInitialInput:400,candidateInitialInput:300,reservedTokens:11000,budgetLimit:10000,note:'No generation.',blockers:[{code:'suite-budget-exceeded',detail:'1000 more tokens needed.',evidence:[{id:'R1',file:'<script>',line:1,quote:'<img onerror=bad()>'}]}]});
 assert(html.includes('full test allowance'));assert(!html.includes('Missing field'));assert(!html.includes('<script>'));assert(html.includes('&lt;img'));
});
test('Python exports include the sample cases and construct the same state-bearing requests as Node',async()=>{
 const a=await analysis(),output=bundleFiles(a,[],files),dir=fs.mkdtempSync(path.join(os.tmpdir(),'promptimize-preflight-'));
 try{
  assert.equal(JSON.parse(output['cases.json']).length,6);
  for(const [name,content]of Object.entries(output)){const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
  const c=sample.cases()[3];
  for(const context of [c.context,c.followupContext]){
   const code='import json,sys\nfrom loader import runtime_request\nprint(json.dumps(runtime_request(json.loads(sys.argv[1]),sys.argv[2],False,sys.argv[3])))';
   const r=spawnSync('python3',['-c',code,JSON.stringify(context),c.query,c.intent],{cwd:dir,encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);
   const node=require('../../api/_semantic-runtime').semanticCase(files,a,{mode:'candidate',executionContext:context,utterance:c.query,intent:c.intent});assert.deepEqual(JSON.parse(r.stdout).messages,node.messages);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
