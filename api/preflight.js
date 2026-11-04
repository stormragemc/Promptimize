const {json,error,validateFiles,countTokens}=require('./_meta');
const {validateAnalysis,messagesFor}=require('./_bundle');const jd=require('./_organize');
const {compileRuntime,semanticCase,selectionReceipt,EXECUTION_TOKEN_BUDGET,OUTPUT_RESERVE}=require('./_semantic-runtime');
const eventInputs=[
 ['refund','Event ID EV-7. My purchase was 30 days ago. The organizer cancelled the event. Am I eligible?',4],
 ['cancellation','I own booking B-41. I have not confirmed cancellation. Cancel it.',1],
 ['profile','Show my profile. Do not change it.',1]
];

async function semanticPreflight(files,a,res){
 const isJD=a.adapter==='jd-viewer-v1';
 if(!isJD&&a.adapter!=='sample')return json(res,400,{error:'The built-in preflight suite applies only to JD-viewer and bundled event cases.'});
 const suite=isJD
  ?(a.testCases||jd.CASES).map(c=>jd.CASES.find(test=>test.id===c.id)).filter(Boolean)
   .map(test=>({id:test.id,executionContext:test.context,utterance:test.query,intent:test.intent,weight:1}))
  :eventInputs.map(([intent,utterance,weight])=>({id:intent,intent,utterance,weight}));
 const plan=compileRuntime(a);
 const executions=await Promise.all(suite.flatMap(test=>['baseline','candidate'].map(async mode=>{
  const {messages,selection}=semanticCase(files,a,{...test,mode,plan});
  return {caseId:test.id,mode,weight:test.weight,tokens:messages?await countTokens(messages):null,selection};
 })));
 const unresolved=executions.filter(run=>run.tokens===null||run.tokens+OUTPUT_RESERVE>EXECUTION_TOKEN_BUDGET)
  .map(run=>({
   caseId:run.caseId,mode:run.mode,
   ...(run.tokens===null?{contextSelection:selectionReceipt(run.selection)}:{inputTokens:run.tokens,code:'execution-token-budget-exceeded'})
  }));
 const sum=mode=>executions.filter(run=>run.mode===mode).reduce((total,run)=>total+run.weight*(run.tokens||0),0);
 const baseline=sum('baseline'),candidate=sum('candidate');
 const generationCallsMax=isJD?suite.length*2:14;
 const lookupReserve=isJD?0:(executions[0]?.tokens||0)+(executions[1]?.tokens||0)+400;
 const reserved=baseline+candidate+generationCallsMax*OUTPUT_RESERVE+lookupReserve;
 const budgetLimit=isJD?100000:30000;
 return json(res,200,{
  snapshot:a.sha256,baselineInitialInput:baseline,candidateInitialInput:candidate,reservedTokens:reserved,
  budgetLimit,generationCallsMax,canRun:!!suite.length&&!unresolved.length&&candidate<baseline&&reserved<=budgetLimit,
  note:unresolved.length?'Some case contexts are unresolved or exceed the per-call allowance. No generation started.':'Resolved baseline and candidate requests sized before generation. Includes a bounded output reserve and simulated lookup follow-ups where applicable.',
  unresolvedCases:unresolved
 });
}
module.exports=async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'POST required'});try{
 const files=validateFiles(req.body?.files),a=req.body?.analysis;validateAnalysis(a,files);
 if(a.semantic)return await semanticPreflight(files,a,res);
 if(a.adapter==='jd-viewer-v1'){const suite=(a.testCases||jd.CASES).map(c=>jd.CASES.find(x=>x.id===c.id)).filter(Boolean);const counts=await Promise.all(suite.flatMap(test=>['baseline','candidate'].map(mode=>countTokens(jd.classifyMessages(files,a,test,mode)))));let baseline=0,candidate=0;for(let i=0;i<counts.length;i+=2){baseline+=counts[i];candidate+=counts[i+1]}const reserved=baseline+candidate+suite.length*2*750;return json(res,200,{snapshot:a.sha256,baselineInitialInput:baseline,candidateInitialInput:candidate,reservedTokens:reserved,budgetLimit:100000,generationCallsMax:suite.length*2,canRun:candidate<baseline&&reserved<=100000,note:'JD-viewer classification cases, both versions. Input sizing plus bounded output reserve. No production actions.'})}
 const counts=await Promise.all(eventInputs.flatMap(([intent,q])=>['baseline','candidate'].map(mode=>countTokens(messagesFor(files,a,intent,q,mode)))));
 let baseline=0,candidate=0;eventInputs.forEach(([, ,weight],i)=>{baseline+=weight*counts[i*2];candidate+=weight*counts[i*2+1]});
 const reserved=baseline+candidate+14*750+counts[0]+counts[1]+400;
 json(res,200,{snapshot:a.sha256,baselineInitialInput:baseline,candidateInitialInput:candidate,reservedTokens:reserved,budgetLimit:30000,generationCallsMax:14,canRun:candidate<baseline&&reserved<=30000,note:'Representative request sizing, not exact billing. Reserve includes output caps and two lookup follow-ups. Caching and accounting can differ.'});
 }catch(e){error(res,e)}};
