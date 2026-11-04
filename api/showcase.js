// POST only for paid work; the read-only GET exposes fictional fixtures and installed evidence.
const {json,error,meta,countTokens,MODEL}=require('./_meta');
const S=require('./_showcase');
const {proposeSemantic}=require('./_semantic-analysis');
const {revise}=require('./_review'),{bundleFiles}=require('./_export');
const {charge}=require('../evaluation-metrics');
module.exports=async(req,res)=>{
 if(req.method==='GET')return json(res,200,{name:'Forma',fictional:true,files:S.source.files,context:S.source.context,cases:S.cases,installed:!!S.readInstalled(),installedSnapshot:S.readInstalled()?.analysis.sha256,evidence:(()=>{try{return require('../demo/generated/benchmark.json')}catch{return null}})()});
 if(req.method!=='POST')return json(res,405,{error:'POST required'});
 try{
  const b=req.body||{};
  if(b.action==='analyze'){
   const analysis=await proposeSemantic(S.source.files,S.source.context,{limits:{batchChars:3500,maxPairs:6,maxCalls:10}});
   return json(res,200,{analysis,sourceHash:S.hash(S.source.files)});
  }
  if(b.action==='compile'){
   const analysis=revise(S.source.files,b.analysis,{...(b.draft||{}),notes:'Fictional Forma showcase: source-backed review for frozen comparison. No employer content.'});
   const pkg={format:'forma-promptimize-export.v1',sourceHash:S.hash(S.source.files),analysis,files:bundleFiles(analysis,[],S.source.files)};
   S.verifyPackage(pkg);return json(res,200,{package:pkg});
  }
  if(b.action!=='request')return json(res,400,{error:'Unknown showcase action.'});
  if(!['before','after'].includes(b.version))return json(res,400,{error:'Choose before or after.'});
  const test=b.caseId?S.cases.find(c=>c.id===b.caseId):null;
  if(b.caseId&&!test)return json(res,400,{error:'Unknown case.'});
  const query=test?.query||b.query,context=test?.context||b.context;
  if(typeof query!=='string'||!query.trim()||query.length>800||!context||JSON.stringify(context).length>8000)return json(res,400,{error:'A short request and bounded fixture context are required.'});
  const prepared=S.prepare(b.version,b.package||S.readInstalled(),context,query);
  const sizeStart=performance.now(),inputTokens=await countTokens(prepared.messages),sizingMs=performance.now()-sizeStart;
  const outputCap=500,reserved=inputTokens+outputCap;
  if(reserved>12000||!Number.isInteger(b.remainingTokens)||b.remainingTokens<reserved||b.remainingTokens>240000)return json(res,400,{error:'Insufficient bounded allowance; generation did not start.',inputTokens,reservedTokens:reserved,providerAttempted:false});
  const started=Date.now();
  let result;
  try{result=await meta(prepared.messages,outputCap,{reasoningEffort:'minimal'});}
  catch(e){return json(res,200,{status:'incomplete',version:b.version,caseId:test?.id,reason:e.publicMessage||e.message,usage:e.providerUsage||{},usageKnown:!!e.providerUsage,model:MODEL,latencyMs:Date.now()-started,reservedTokens:reserved,packageHash:prepared.packageHash});}
  const answer={intent:String(result.value.intent||''),entities:result.value.entities||{}};
  const registryAllowed=prepared.intentIds.includes(answer.intent);const scored=test?S.score(test,answer):{simulation:require('./_simulation').simulateJD({query,context:S.completeContext(context)},answer),pass:null};
  scored.simulation.registryAllowed=registryAllowed;scored.simulation.passed=scored.simulation.passed&&registryAllowed;if(scored.pass!==null)scored.pass=scored.pass&&registryAllowed;return json(res,200,{status:'completed',version:b.version,caseId:test?.id,model:result.model,answer,...scored,usage:result.usage,usageKnown:Number.isInteger(result.usage.prompt_tokens)&&Number.isInteger(result.usage.completion_tokens),costEstimateUSD:charge(result.usage,result.model),latencyMs:result.elapsedMs,sizingMs,measuredInputTokens:inputTokens,reservedTokens:reserved,retrievalMs:prepared.retrievalMs,contextCharacters:prepared.contextCharacters,selection:prepared.selection,packageHash:prepared.packageHash,recordedAt:new Date().toISOString()});
 }catch(e){e.publicMessage=e.message;e.status=e.status||400;error(res,e);}
};
