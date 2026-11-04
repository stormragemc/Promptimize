const {json,error,validateFiles,meta,countTokens,MODEL}=require('./_meta');
const {validatePlan,prepare,reservation,OUTPUT,MAX_CALL}=require('./_evaluation');
const {simulateJD,simulateSample}=require('./_simulation');
const {isDeepStrictEqual}=require('node:util');
function aggregate(calls){const u={prompt_tokens:0,completion_tokens:0,total_tokens:0};for(const call of calls){const v=call.usage||{};for(const k of Object.keys(u))u[k]+=v[k]||0;}return u;}
module.exports=async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 const calls=[],toolCalls=[],started=Date.now();let a,p,test,mode,prepared,remaining,reserved=0;
 const respond=(status,extra={})=>json(res,200,{status,pass:null,mode,snapshot:a?.sha256,planHash:p?.sha256,caseId:test?.id,repetition:req.body?.repetition,usage:aggregate(calls),
  model:MODEL,latencyMs:Date.now()-started,toolCalls,contextSelection:prepared?.selection,
  loadedModules:prepared?.selection?.modules||Object.keys(a?.modules||{}),
  measurement:{calls,retrievalMs:prepared?.retrievalMs||0,reservedTokens:reserved,unknownUsageCalls:calls.filter(call=>!call.usageKnown).length,routingProviderCalls:0,fallbackProviderCalls:0,fallbackExpansions:prepared?.selection?.fallbackExpansions||0,retryProviderCalls:0},...extra});
 try{
  const files=validateFiles(req.body?.files);a=req.body?.analysis;p=validatePlan(req.body?.plan,files,a);mode=req.body?.mode;
  test=p.cases.find(test=>test.id===req.body?.caseId&&test.enabled);
  if(!test||!['baseline','candidate'].includes(mode)||!Number.isInteger(req.body?.repetition)||req.body.repetition<1||req.body.repetition>p.repetitions)throw Object.assign(Error('Invalid reviewed case or repetition'),{status:400,publicMessage:'Invalid reviewed case or repetition.'});
  remaining=req.body.remainingTokens;if(!Number.isInteger(remaining)||remaining<0||remaining>p.budgetLimit)throw Object.assign(Error('Invalid remaining allowance'),{status:400,publicMessage:'Invalid remaining token allowance.'});
  prepared=prepare(files,a,test,mode);
  if(!prepared.messages)return respond('incomplete',{reason:'Required context or state is unresolved. No generation started.'});
  let messages=prepared.messages;
  async function generate(){
   const sizingStart=Date.now(),sized=await countTokens(messages),sizingMs=Date.now()-sizingStart;
   const needed=sized+OUTPUT;
   if(needed>MAX_CALL||needed>remaining)throw Object.assign(Error('Token allowance exceeded before generation.'),{budget:true});
   if(!calls.length&&reservation(sized,test)>remaining)throw Object.assign(Error('The bounded task and lookup reserve exceeds the remaining allowance.'),{budget:true});
   remaining-=needed;reserved+=needed;
   const call={stage:calls.length?'tool-follow-up':'classification',mode,model:MODEL,status:'started',sizingInputTokens:sized,sizingMs,reservedTokens:needed,usageKnown:false};calls.push(call);
   const time=Date.now();
   try{const result=await meta(messages,OUTPUT,{reasoningEffort:'minimal'});call.status='completed';call.usage=result.usage;call.model=result.model;call.usageKnown=Number.isInteger(result.usage?.prompt_tokens)&&Number.isInteger(result.usage?.completion_tokens);return result.value;}
   catch(e){call.status=e.providerUsage?'incomplete':'provider-error';call.usage=e.providerUsage||{};call.usageKnown=Number.isInteger(call.usage.prompt_tokens)&&Number.isInteger(call.usage.completion_tokens);throw e;}
   finally{call.elapsedMs=Date.now()-time;const actual=call.usage?.total_tokens;if(Number.isSafeInteger(actual)&&actual>needed)remaining-=actual-needed;}
  }
  let answer=await generate(),failureReason='';
  if(p.adapter==='sample'&&answer.action==='lookup_event_status'){
   const allowed=test.tool==='lookup_event_status'&&answer.event_id==='EV-7';
   toolCalls.push({name:'lookup_event_status',arguments:{event_id:answer.event_id},result:allowed?'organizer_cancelled':'rejected',executed:allowed});
   if(!allowed)failureReason='Unexpected or invalid simulated lookup.';
   else{messages=[...messages,{role:'assistant',content:JSON.stringify(answer)},{role:'user',content:'SIMULATED TOOL RESULT lookup_event_status(EV-7): organizer_cancelled. Decide eligibility now. JSON only.'}];answer=await generate();}
  }
  const action=p.adapter==='sample'?answer.action:answer.intent;
  if(typeof action!=='string'||!action.trim())return respond('incomplete',{reason:'The model returned no usable action. Usage is retained; no behavioral score was assigned.'});
  const actionMatches=action===test.expected&&(!test.field||answer.entities?.[test.field]===test.value);
  const toolMatches=p.adapter!=='sample'||toolCalls.length===(test.tool?1:0);
  const simulation=p.adapter==='sample'?simulateSample(test,answer,toolCalls,actionMatches&&toolMatches&&!failureReason):simulateJD({...test,assertions:test.expectedState},answer);
  const stateAssertions=Object.entries(test.expectedState).map(([key,value])=>({label:key,expected:value,actual:simulation.finalState[key],pass:isDeepStrictEqual(value,simulation.finalState[key])}));
  const pass=actionMatches&&toolMatches&&!failureReason&&simulation.passed&&stateAssertions.every(item=>item.pass);
  simulation.assertions.push(...stateAssertions.filter(item=>!simulation.assertions.some(existing=>existing.label===item.label)));simulation.passed=pass;
  const investigation=pass?null:{nextProposalOnly:true,caseId:test.id,sourceRuleIds:test.ruleIds,
   observation:!actionMatches?'The action or canonical entity did not match the reviewed expectation.':!simulation.passed?'The simulated precondition or resulting state did not match.':'The tool sequence did not match.',
   inspect:mode==='baseline'?['Validate the test oracle against the original instructions.','Check the supplied state and fixture assumptions before changing prompts.']:
    ['Compare required source rules with the recorded context selection.','Inspect phase conditions, exception precedence and dependency closure.','Compare canonical intent/entity schemas before proposing a wording change.']};
  return respond('completed',{pass,simulation,investigation,answer:{action:String(action||'unknown'),entities:answer.entities||{}},failureReason:pass?'':failureReason||'Reviewed action, entity, tool or state assertion failed. Investigate source and dependencies in the next proposal.'});
 }catch(e){
  if(p&&test&&(e.budget||calls.length))return respond('incomplete',{reason:e.publicMessage||e.message,code:e.budget?'BUDGET_STOP':e.code||'PROVIDER_ERROR'});
  error(res,e);
 }
};
