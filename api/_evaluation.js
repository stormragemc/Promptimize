const {createHash}=require('node:crypto');
const {stableStringify}=require('./_semantic-context');
const {validateAnalysis,messagesFor}=require('./_bundle');
const jd=require('./_organize');
const {semanticCase,selectionReceipt}=require('./_semantic-runtime');
const hash=value=>createHash('sha256').update(stableStringify(value)).digest('hex');
const fail=message=>Object.assign(Error(message),{status:400,publicMessage:message});
const OUTPUT=750, MAX_CALL=20000, MAX_SUITE=300000;
const EVENT_CASES=[...require('../sample-contract').CASES,
 {id:'H01',intent:'refund',name:'Outside refund window',query:'Event EV-9 is not cancelled. I bought my ticket 15 days ago. Am I eligible for a refund?',expected:'ineligible',partition:'holdout',context:{event_id:'EV-9',purchase_age_days:15,event_status:'not_cancelled'}},
 {id:'H02',intent:'refund',name:'Missing identifier',query:'I bought a ticket 30 days ago and do not know the cancellation status. I do not have an event ID. Can I get a refund?',expected:'ask_event_id',partition:'holdout',context:{purchase_age_days:30,event_status:'unknown'}},
 {id:'H03',intent:'refund',name:'Organizer exception paraphrase',query:'Event EV-8 was called off by its organizer. The ticket was purchased 90 days ago. Is a refund allowed?',expected:'eligible',partition:'holdout',context:{event_id:'EV-8',purchase_age_days:90,event_status:'organizer_cancelled'}}
];
const APPLICANT={jd_viewer_open:true,jd_viewer_status:'PUBLISHED',jd_published_viewer_active_tab:'applicants',entity_domain_hint:'candidate'};
const JD_HOLDOUT=[
 {id:'H01',name:'Name-only applicant',query:'Alex Example',context:APPLICANT,expected:'view_published_jd_applicant',field:'applicant_name_query',value:'Alex Example'},
 {id:'H02',name:'Name-only attendee',query:'Alex Example',context:{...APPLICANT,interview_workflow_phase:'awaiting_attendee_names'},expected:'interview_scheduling',field:'attendee_name_query',value:'Alex Example'},
 {id:'H03',name:'Dismiss panel paraphrase',query:'Dismiss this evaluation panel, please',context:{...APPLICANT,jd_evaluation_results_modal_open:true},expected:'close_published_jd_applicant_evaluation_results'},
 {id:'H04',name:'Explicit workflow switch',query:'Switch to leave and start a new leave request',context:APPLICANT,expected:'apply_leave'}
].map(test=>({...test,intent:'jd-viewer',partition:'holdout'}));
const JD_INTENTS=new Set(jd.CASES.map(test=>test.expected));
const EVENT_ACTIONS=new Set(['eligible','ineligible','ask_event_id','ask_confirmation','show_profile','cancel_booking','save_profile','escalate']);
const STATE_KEYS=new Set(['workspace','jdOpen','evaluationOpen','evaluationTab','candidateInfoOpen','candidateInfoTab','selectedApplicant','attendees','leaveFormOpen']);
function expectedState(test){
 switch(test.expected){
 case 'navigate_published_jd_applicant_evaluation_tab':return {evaluationTab:test.value,evaluationOpen:true,jdOpen:true};
 case 'close_published_jd_applicant_evaluation_results':return {evaluationOpen:false,jdOpen:true};
 case 'navigate_candidate_information_tab':return {candidateInfoTab:test.value,candidateInfoOpen:true};
 case 'view_published_jd_applicant':return {selectedApplicant:'applicant-fixture-1',leaveFormOpen:false};
 case 'interview_scheduling':return {attendees:['Alex Example'],selectedApplicant:null,leaveFormOpen:false};
 case 'apply_leave':return {workspace:'leave',leaveFormOpen:true};
 default:return {};
 }
}
function adapterFor(files,a){
 if(a.adapter==='jd-viewer-v1'&&jd.detect(files))return 'jd-viewer-v1';
 const names=['shared.md','refunds.md','cancellations.md','profile.md','router.txt'];
 if(files.length===5&&names.every(name=>files.some(file=>file.name===name)))return 'sample';
 throw fail('Reviewed simulations currently support the bundled event sample and JD-viewer files.');
}
function createPlan(files,a){
 validateAnalysis(a,files);
 const adapter=adapterFor(files,a);
 const cases=(adapter==='sample'?EVENT_CASES:[...jd.CASES,...JD_HOLDOUT]).map(test=>{
  const refs=adapter==='sample'?a.rules.filter(rule=>(rule.workflows||[]).includes(test.intent)||rule.file.includes(test.intent==='refund'?'refund':test.intent))
   :a.rules.filter(rule=>rule.quote.includes(test.expected));
  return {...test,context:test.context||{},partition:test.partition||'development',enabled:test.partition!=='holdout',
   critical:true,ruleIds:refs.map(rule=>rule.id),expectedState:adapter==='sample'?{}:expectedState(test)};
 });
 const plan={schemaVersion:1,adapter,snapshot:a.sha256,sourceHash:hash(files),repetitions:1,budgetLimit:adapter==='sample'?30000:100000,cases,approved:false};
 plan.sha256=planHash(plan);return plan;
}
function planHash(plan){const {sha256,...body}=plan;return hash(body);}
function validatePlan(plan,files,a,{approved=true}={}){
 validateAnalysis(a,files);
 if(!plan||plan.schemaVersion!==1||plan.snapshot!==a.sha256||plan.sourceHash!==hash(files)||plan.adapter!==adapterFor(files,a))throw fail('Test plan belongs to a different candidate or source. Build and review a new plan.');
 if(!Number.isInteger(plan.repetitions)||plan.repetitions<1||plan.repetitions>3||!Number.isInteger(plan.budgetLimit)||plan.budgetLimit<1000||plan.budgetLimit>MAX_SUITE)throw fail('Choose 1–3 repetitions and a token allowance from 1,000 to 300,000.');
 if(!Array.isArray(plan.cases)||!plan.cases.length||plan.cases.length>24||!plan.cases.some(test=>test.enabled))throw fail('Select at least one case, with at most 24 cases in the plan.');
 const ids=new Set(),rules=new Set(a.rules.map(rule=>rule.id));
 for(const test of plan.cases){
  if(typeof test.id!=='string'||!/^[A-Za-z][\w-]{0,29}$/.test(test.id)||ids.has(test.id))throw fail('Test IDs must be unique and use letters, digits, underscores or hyphens.');ids.add(test.id);
  if(typeof test.name!=='string'||!test.name.trim()||test.name.length>150||typeof test.query!=='string'||!test.query.trim()||test.query.length>1500||typeof test.enabled!=='boolean'||typeof test.critical!=='boolean'||!['development','holdout'].includes(test.partition))throw fail('Invalid test name, request, selection, severity or partition.');
  if(!(plan.adapter==='sample'?EVENT_ACTIONS:JD_INTENTS).has(test.expected)||test.intent!==(plan.adapter==='sample'?test.intent:'jd-viewer')||(plan.adapter==='sample'&&!['refund','cancellation','profile'].includes(test.intent)))throw fail('Use an expected action supported by this simulated adapter.');
  if(test.field!==undefined&&(typeof test.field!=='string'||!/^\w{1,80}$/.test(test.field)||typeof test.value!=='string'||test.value.length>200))throw fail('Entity assertions require an exact field and string value.');
  try{require('../sample-contract').state(test.context);if(test.tool)require('../sample-contract').state(test.followupContext);}catch(e){throw fail(test.tool?'Provide valid before and after-lookup context in the case JSON, then approve the plan again.':e.message);}
  if(!test.expectedState||typeof test.expectedState!=='object'||Array.isArray(test.expectedState)||Object.keys(test.expectedState).some(key=>!STATE_KEYS.has(key))||JSON.stringify(test.expectedState).length>2000)throw fail('Invalid simulated state assertions.');
  if(!Array.isArray(test.ruleIds)||(test.enabled&&!test.ruleIds.length)||new Set(test.ruleIds).size!==test.ruleIds.length||test.ruleIds.some(id=>!rules.has(id)))throw fail('Test coverage must reference existing original rules.');
  if(test.tool!==undefined&&(plan.adapter!=='sample'||test.tool!=='lookup_event_status'))throw fail('Unsupported simulated tool.');
 }
 if(approved&&(!plan.approved||plan.sha256!==planHash(plan)))throw fail('Review and approve this exact test plan before running.');
 return plan;
}
function approvePlan(plan,files,a){validatePlan(plan,files,a,{approved:false});const next=structuredClone(plan);next.approved=true;next.sha256=planHash(next);return next;}
function prepare(files,a,test,mode,stage='initial'){
 const start=Date.now();let messages,selection;
 if(adapterFor(files,a)==='sample'){
  const out=require('./_sample-test').prepare(files,a,test,mode,stage);messages=out.messages;selection=out.selection&&selectionReceipt(out.selection);
 }else if(a.semantic){const out=semanticCase(files,a,{mode,executionContext:test.context,utterance:test.query,intent:test.intent});messages=out.messages;selection=out.selection&&selectionReceipt(out.selection);}
 else messages=jd.classifyMessages(files,a,test,mode);
 return {messages,selection,retrievalMs:Date.now()-start};
}
function reservation(input,test,followupInput){return test.tool&&Number.isInteger(followupInput)?input+OUTPUT+followupInput+OUTPUT:input+OUTPUT+(test.tool?input+2*OUTPUT+128:0);}

function coverage(plan,a){const selected=plan.cases.filter(test=>test.enabled);const covered=new Set(selected.flatMap(test=>test.ruleIds));return {declaredCoveredRules:covered.size,totalRules:a.rules.length,uncoveredRuleIds:a.rules.filter(rule=>!covered.has(rule.id)).map(rule=>rule.id),criticalCases:selected.filter(test=>test.critical).length,holdoutCases:selected.filter(test=>test.partition==='holdout').length};}
module.exports={createPlan,approvePlan,validatePlan,planHash,prepare,reservation,coverage,OUTPUT,MAX_CALL,MAX_SUITE};
