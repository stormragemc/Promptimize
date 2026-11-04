(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PromptimizeMetrics=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const pricing={model:'muse-spark-1.3',currency:'USD',perTokens:1000000,input:1.25,cachedInput:0.15,output:4.25,verified:'2026-11-04',source:'https://dev.meta.ai/docs/pricing-rate-limits'};
 const valid=value=>Number.isSafeInteger(value)&&value>=0;
 function charge(usage,model){
  if(model!==pricing.model||!valid(usage?.prompt_tokens)||!valid(usage?.completion_tokens))return null;
  const cached=usage.prompt_tokens_details?.cached_tokens;
  if(cached!==undefined&&(!valid(cached)||cached>usage.prompt_tokens))return null;
  // An absent cache count is priced conservatively as uncached input.
  return ((usage.prompt_tokens-(cached||0))*pricing.input+(cached||0)*pricing.cachedInput+usage.completion_tokens*pricing.output)/pricing.perTokens;
 }
 function optimizer(a){
  const previous=(a?.analysisAttempts||[]).map(call=>({...call,usageKnown:valid(call.usage?.prompt_tokens)&&valid(call.usage?.completion_tokens),cost:charge(call.usage,call.model)}));
  if(a?.semantic)return previous.concat(a.semantic.calls.filter(call=>call.status!=='budget-skipped').map(call=>({...call,usageKnown:call.status==='cached'||valid(call.usage?.prompt_tokens)&&valid(call.usage?.completion_tokens),cost:call.status==='cached'?0:charge(call.usage,call.model||a.model)})));
  if(a?.analysisCalls)return previous.concat(a.analysisCalls.map(call=>({...call,usageKnown:valid(call.usage?.prompt_tokens)&&valid(call.usage?.completion_tokens),cost:charge(call.usage,call.model)})));
  if(a?.model==='Source-preserving JD viewer adapter')return [];
  return a?previous.concat([{stage:'legacy-analysis',status:'completed',model:a.model,usage:a.usage,usageKnown:valid(a.usage?.prompt_tokens)&&valid(a.usage?.completion_tokens),cost:charge(a.usage,a.model)}]):previous;
 }
 const total=(items,key)=>items.reduce((sum,item)=>sum+(Number.isFinite(item[key])?item[key]:0),0);
 function percentile(values,p){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*p)-1];}
 function traceMatches(row,snapshot,planHash){
  const before=row?.baseline,after=row?.candidate;
  if(!before||!after||[before,after].some(result=>result.status!=='completed'||result.pass!==true||result.simulation?.passed!==true||result.snapshot!==snapshot||(planHash&&result.planHash!==planHash)))return false;
  const left=before.simulation.finalState,right=after.simulation.finalState;
  if(!left||!right||!Object.keys(left).length||!Object.keys(right).length)return false;
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
 }
 function budgetState(required,allocated){
  if(!Number.isSafeInteger(required)||required<0||!Number.isSafeInteger(allocated)||allocated<0)return null;
  return {kind:required>allocated?'insufficient':required>0&&required>=allocated*.9?'tight':'ready',required,allocated,
   difference:allocated-required,recommended:Math.min(300000,Math.ceil(required*1.1/1000)*1000)};
 }
 function summarize(a,plan,results){
  const calls=[],latest={baseline:[],candidate:[]},bindingErrors=[];
  const selected=new Set((plan?.cases||[]).filter(test=>test.enabled).map(test=>test.id));const seen=new Set();
  for(const row of results){
   const baseId=row.case.baseId||row.case.id;const rowKey=baseId+':'+(row.case.repetition||1);
   const validRow=selected.has(baseId)&&!seen.has(rowKey);seen.add(rowKey);
   if(!validRow)bindingErrors.push('Unknown or duplicate case result: '+row.case.id);
   for(const side of ['baseline','candidate']){
    if(row[side]){if(validRow&&row[side].snapshot===a.sha256&&row[side].planHash===plan.sha256)latest[side].push(row[side]);else bindingErrors.push('Result is not bound to this snapshot and test plan: '+row.case.id+'/'+side);}
    for(const result of [...(row.attempts||[]).filter(attempt=>attempt.mode===side),...(row[side]?[row[side]]:[])]){
     const receipts=result.measurement?.calls;
     if(receipts){for(const call of receipts)calls.push({...call,caseId:row.case.id,cost:charge(call.usage,call.model)});}
     else calls.push({mode:side,caseId:row.case.id,status:'unverified-receipt',usage:result.usage||{},usageKnown:false,cost:null});
    }
   }
  }
  const setup=optimizer(a),sideSummary=side=>{
   const receipts=calls.filter(call=>call.mode===side),outcomes=latest[side];
   const attempts=results.flatMap(row=>[...(row.attempts||[]).filter(result=>result.mode===side),...(row[side]?[row[side]]:[])]);
   const costs=receipts.map(call=>call.cost),times=outcomes.filter(result=>result.status==='completed').map(result=>result.latencyMs).filter(Number.isFinite);
   return {calls:receipts.length,completed:outcomes.filter(result=>result.status==='completed').length,passed:outcomes.filter(result=>result.status==='completed'&&result.pass).length,
    inputTokens:receipts.reduce((n,call)=>n+(call.usage?.prompt_tokens||0),0),outputTokens:receipts.reduce((n,call)=>n+(call.usage?.completion_tokens||0),0),
    reasoningTokens:receipts.reduce((n,call)=>n+(call.usage?.completion_tokens_details?.reasoning_tokens||0),0),cachedInputTokens:receipts.reduce((n,call)=>n+(call.usage?.prompt_tokens_details?.cached_tokens||0),0),
    totalTokens:receipts.reduce((n,call)=>n+(valid(call.usage?.total_tokens)?call.usage.total_tokens:(call.usage?.prompt_tokens||0)+(call.usage?.completion_tokens||0)),0),unknownUsageCalls:receipts.filter(call=>!call.usageKnown).length,
    costUSD:costs.every(cost=>cost!==null)?costs.reduce((n,cost)=>n+cost,0):null,
    p50LatencyMs:percentile(times,.5),p95LatencyMs:percentile(times,.95),sizingMs:total(receipts,'sizingMs'),generationMs:total(receipts,'elapsedMs'),
    retrievalMs:attempts.reduce((n,result)=>n+(result.measurement?.retrievalMs||0),0),fallbackExpansions:attempts.reduce((n,result)=>n+(result.measurement?.fallbackExpansions||0),0),retries:results.reduce((n,row)=>n+(row.attempts||[]).filter(attempt=>attempt.mode===side).length,0)};
  };
  const baseline=sideSummary('baseline'),candidate=sideSummary('candidate');
  const partitions=Object.fromEntries(['development','holdout'].map(partition=>[partition,Object.fromEntries(['baseline','candidate'].map(mode=>{const outcomes=results.filter(row=>row.case.partition===partition).map(row=>row[mode]);return [mode,{completed:outcomes.filter(result=>result?.status==='completed').length,passed:outcomes.filter(result=>result?.status==='completed'&&result.pass).length}];}))]));
  const expected=plan?.cases.filter(test=>test.enabled).length*(plan?.repetitions||1)||0;
  const complete=expected>0&&!bindingErrors.length&&baseline.completed===expected&&candidate.completed===expected;
  const qualityPassed=complete&&baseline.passed===expected&&candidate.passed===expected;
  const setupCost=setup.every(call=>call.cost!==null)?total(setup,'cost'):null;
  const savings=baseline.costUSD!==null&&candidate.costUSD!==null?baseline.costUSD-candidate.costUSD:null;
  const allKnown=baseline.unknownUsageCalls===0&&candidate.unknownUsageCalls===0&&setup.every(call=>call.usageKnown);
  let decision=!complete?'incomplete':!qualityPassed?'do-not-adopt':!allKnown||savings===null?'cost-unverified':savings<=0?'do-not-adopt':'eligible-for-review';
  const perRequestSaved=expected&&savings!==null?savings/expected:null;
  return {schemaVersion:1,snapshot:a?.sha256,planHash:plan?.sha256,pricing,expectedPairs:expected,complete,qualityPassed,decision,baseline,candidate,partitions,bindingErrors,
   optimizer:{calls:setup.length,providerCalls:setup.filter(call=>call.status!=='cached').length,cacheHits:setup.filter(call=>call.status==='cached').length,costUSD:setupCost,totalTokens:setup.reduce((n,call)=>n+(call.usage?.total_tokens||0),0),unknownUsageCalls:setup.filter(call=>!call.usageKnown).length,receipts:setup},
   estimatedSavingsUSD:savings,breakEvenRequests:qualityPassed&&allKnown&&perRequestSaved>0&&setupCost!==null?Math.ceil(setupCost/perRequestSaved):null,
   totalExperimentEstimateUSD:setupCost!==null&&baseline.costUSD!==null&&candidate.costUSD!==null?setupCost+baseline.costUSD+candidate.costUSD:null,
   calls,limitations:['Pricing-based estimates, not an invoice. Missing cache counts use the uncached rate.','Local routing and fallback make no provider calls; their selected text is billed within classification.','Only the supported simulated adapters are measured; the production Gateway composer was not supplied.','Rule coverage is human-declared. Small repeated/holdout suites are not production reliability estimates.']};
 }
 return {pricing,charge,optimizer,summarize,traceMatches,budgetState};
});
