const {json,error,validateFiles,meta,countTokens}=require('./_meta');
const {simulateSample}=require('./_simulation');
const CASES={T01:{intent:'refund',expected:'eligible'},T02:{intent:'refund',expected:'eligible'},T03:{intent:'refund',expected:'eligible'},T04:{intent:'refund',expected:'eligible',tool:'lookup_event_status'},T05:{intent:'cancellation',expected:'ask_confirmation'},T06:{intent:'profile',expected:'show_profile'}};
const {validateAnalysis,messagesFor}=require('./_bundle');
const {semanticCase,selectionReceipt,requestUnresolved,EXECUTION_TOKEN_BUDGET,OUTPUT_RESERVE}=require('./_semantic-runtime');
const usageOf=u=>({prompt_tokens:u?.prompt_tokens||0,completion_tokens:u?.completion_tokens||0,total_tokens:u?.total_tokens||0});
function addUsage(total,increment,includeReasoning){
 const tokens=usageOf(increment);
 for(const key of Object.keys(tokens))total[key]+=tokens[key];
 if(includeReasoning&&Number.isInteger(increment?.completion_tokens_details?.reasoning_tokens)){
  const details=total.completion_tokens_details||={reasoning_tokens:0};
  details.reasoning_tokens+=increment.completion_tokens_details.reasoning_tokens;
 }
}
async function generate(messages,semantic){
 if(semantic&&await countTokens(messages)+OUTPUT_RESERVE>EXECUTION_TOKEN_BUDGET){
  throw Object.assign(Error('Execution token allowance exceeded before generation.'),{runtimeBudget:true});
 }
 return meta(messages,OUTPUT_RESERVE,{reasoningEffort:'minimal'});
}
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 const usage=usageOf(),toolCalls=[],started=Date.now();
 let a,mode,receipt;
 try{
  const files=validateFiles(req.body?.files);a=req.body?.analysis;mode=req.body?.mode;
  const c=req.body?.test,known=CASES[c?.id];
  if(!known||c.intent!==known.intent||c.expected!==known.expected||!['baseline','candidate'].includes(mode)||typeof c.query!=='string'||c.query.length>1500)throw Object.assign(Error('Invalid test'),{status:400,publicMessage:'Unsupported test case.'});
  const sampleNames=['shared.md','refunds.md','cancellations.md','profile.md','router.txt'];
  if(files.length!==5||sampleNames.some(n=>!files.find(f=>f.name===n)))throw Object.assign(Error('Sample only'),{status:400,publicMessage:'The fixed test suite applies only to the bundled sample.'});
  validateAnalysis(a,files);
  let messages;
  if(a.semantic){
   const prepared=semanticCase(files,a,{mode,utterance:c.query,intent:known.intent});
   if(prepared.selection)receipt=selectionReceipt(prepared.selection);
   if(!prepared.messages)return json(res,200,{status:'incomplete',mode,pass:null,reason:'Required evidence or execution state is unresolved.',usage,toolCalls,snapshot:a.sha256,contextSelection:receipt});
   messages=prepared.messages;
  }else messages=messagesFor(files,a,known.intent,c.query,mode);
  const context=messages[0].content;
  const first=await generate(messages,a.semantic);let answer=first.value;addUsage(usage,first.usage,!!a.semantic);let failureReason='';
  if(answer.action==='lookup_event_status'){
   const allowed=c.id==='T04'&&answer.event_id==='EV-7';
   toolCalls.push({name:'lookup_event_status',arguments:{event_id:answer.event_id},result:allowed?'organizer_cancelled':'rejected',executed:allowed});
   if(!allowed)failureReason=c.id!=='T04'?'Unexpected lookup: this case already provides the required status.':'Lookup used the wrong event ID.';
   else{
    messages=[...messages,{role:'assistant',content:JSON.stringify(answer)},{role:'user',content:'SIMULATED TOOL RESULT lookup_event_status(EV-7): organizer_cancelled. Decide eligibility now. JSON only.'}];
    const second=await generate(messages,a.semantic);answer=second.value;addUsage(usage,second.usage,!!a.semantic);
   }
  }
  const pass=!failureReason&&answer.action===known.expected&&toolCalls.length===(known.tool?1:0);
  if(!pass&&!failureReason)failureReason=`Expected ${known.expected}${known.tool?' after '+known.tool:''}; received ${String(answer.action||'unknown')}.`;
  json(res,200,{status:'completed',mode,pass,simulation:simulateSample(c,answer,toolCalls,pass),loadedModules:mode==='baseline'?files.map(f=>f.name):(receipt?.modules||['shared',known.intent]),latencyMs:Date.now()-started,failureReason,answer:{action:String(answer.action||'unknown')},toolCalls,usage,snapshot:a.sha256,suiteVersion:2,contextCharacters:context.length,model:first.model,...(receipt?{contextSelection:receipt}:{})});
 }catch(e){
  if(e.runtimeBudget)return json(res,200,{status:'incomplete',mode,pass:null,reason:e.message,usage,toolCalls,snapshot:a?.sha256,contextSelection:requestUnresolved(receipt,EXECUTION_TOKEN_BUDGET)});
  if(e.providerUsage){addUsage(usage,e.providerUsage,!!a?.semantic);return json(res,200,{status:'incomplete',mode,pass:null,reason:e.publicMessage,code:e.code,usage,toolCalls,snapshot:a?.sha256,...(receipt?{contextSelection:receipt}:{})})}
  error(res,e);
 }
};
