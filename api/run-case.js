const {json,error,validateFiles,meta}=require('./_meta');
const {simulateSample}=require('./_simulation');
const CASES={T01:{intent:'refund',expected:'eligible'},T02:{intent:'refund',expected:'eligible'},T03:{intent:'refund',expected:'eligible'},T04:{intent:'refund',expected:'eligible',tool:'lookup_event_status'},T05:{intent:'cancellation',expected:'ask_confirmation'},T06:{intent:'profile',expected:'show_profile'}};
const {validateAnalysis,messagesFor}=require('./_bundle');
const usageOf=u=>({prompt_tokens:u?.prompt_tokens||0,completion_tokens:u?.completion_tokens||0,total_tokens:u?.total_tokens||0});
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 let usage=usageOf(),a,mode,toolCalls=[];const started=Date.now();
 try{
  const files=validateFiles(req.body?.files);a=req.body?.analysis;mode=req.body?.mode;
  const c=req.body?.test,known=CASES[c?.id];
  if(!known||c.intent!==known.intent||c.expected!==known.expected||!['baseline','candidate'].includes(mode)||typeof c.query!=='string'||c.query.length>1500)throw Object.assign(Error('Invalid test'),{status:400,publicMessage:'Unsupported test case.'});
  const sampleNames=['shared.md','refunds.md','cancellations.md','profile.md','router.txt'];
  if(files.length!==5||sampleNames.some(n=>!files.find(f=>f.name===n)))throw Object.assign(Error('Sample only'),{status:400,publicMessage:'The fixed test suite applies only to the bundled sample.'});
  validateAnalysis(a,files);
  let messages=messagesFor(files,a,known.intent,c.query,mode);const context=messages[0].content;
  const first=await meta(messages,750,{reasoningEffort:'minimal'});let answer=first.value;usage=usageOf(first.usage);let failureReason='';
  if(answer.action==='lookup_event_status'){
   const allowed=c.id==='T04'&&answer.event_id==='EV-7';
   toolCalls.push({name:'lookup_event_status',arguments:{event_id:answer.event_id},result:allowed?'organizer_cancelled':'rejected',executed:allowed});
   if(!allowed)failureReason=c.id!=='T04'?'Unexpected lookup: this case already provides the required status.':'Lookup used the wrong event ID.';
   else{
    messages=[...messages,{role:'assistant',content:JSON.stringify(answer)},{role:'user',content:'SIMULATED TOOL RESULT lookup_event_status(EV-7): organizer_cancelled. Decide eligibility now. JSON only.'}];
    const second=await meta(messages,750,{reasoningEffort:'minimal'});answer=second.value;for(const k of Object.keys(usage))usage[k]+=second.usage[k]||0;
   }
  }
  const pass=!failureReason&&answer.action===known.expected&&toolCalls.length===(known.tool?1:0);
  if(!pass&&!failureReason)failureReason=`Expected ${known.expected}${known.tool?' after '+known.tool:''}; received ${String(answer.action||'unknown')}.`;
  json(res,200,{status:'completed',mode,pass,simulation:simulateSample(c,answer,toolCalls,pass),loadedModules:mode==='baseline'?files.map(f=>f.name):['shared',known.intent],latencyMs:Date.now()-started,failureReason,answer:{action:String(answer.action||'unknown')},toolCalls,usage,snapshot:a.sha256,suiteVersion:2,contextCharacters:context.length,model:first.model});
 }catch(e){
  if(e.providerUsage){const extra=usageOf(e.providerUsage);for(const k of Object.keys(usage))usage[k]+=extra[k];return json(res,200,{status:'incomplete',mode,pass:null,reason:e.publicMessage,code:e.code,usage,toolCalls,snapshot:a?.sha256})}
  error(res,e);
 }
};
