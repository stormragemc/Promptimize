// Reviewed regression plans and measured receipts. No provider calls on replay.
const evaluationMoney=value=>value===null?'Unverified':'$'+value.toFixed(5);
const evaluationTime=value=>value===null?'—':(value/1000).toFixed(2)+'s';
const dismissedTraceSuccess=new Set();
let budgetWarningBlocked=false;
function evaluationFinished(){
 return !comparisonsRunning&&!!approved&&!!analysis&&!!evaluationPlan?.approved&&bundleReady?.snapshot===analysis.sha256
  &&evaluationPlan.snapshot===analysis.sha256&&PromptimizeMetrics.summarize(analysis,evaluationPlan,results).complete;
}
function showBudgetWarning(required,allocated,remaining=false){
 const state=PromptimizeMetrics.budgetState(required,Math.max(0,allocated));if(!state||state.kind==='ready')return;
 const insufficient=state.kind==='insufficient',format=n=>n.toLocaleString();
 budgetWarningBlocked=insufficient;
 $('#budget-warning-title').textContent=insufficient?'More tokens needed':'Very little room left';
 $('#budget-warning-message').textContent=remaining
  ?'The next attempt does not fit the remaining allowance. No additional model call started. Edit the test plan to reserve more tokens or reduce the selected work; previous receipts stay archived.'
  :insufficient?'This plan needs more tokens than you allocated. Edit the cases, reduce repetitions, or reserve a larger allowance before running.'
  :'This run fits, but leaves little room for a retry. You can edit the cases and allowance, or explicitly continue with the current limit.';
 $('#budget-required').textContent=format(required);$('#budget-allocated').textContent=format(allocated);
 $('#budget-difference-label').textContent=insufficient?'Shortfall':'Headroom';$('#budget-difference').textContent=format(Math.abs(state.difference));
 $('#budget-warning-advice').textContent=required>300000?'Reduce the selected work; this plan exceeds the maximum 300,000-token allowance.'
  :`A suggested allowance is ${format(state.recommended)} tokens${remaining?' for the next attempt':''}. You still need to approve and size an edited plan. Sizing is not exact billing.`;
 $('#budget-keep-allowance').hidden=insufficient;$('#budget-keep-allowance').disabled=insufficient||!preflight?.canRun;
 $('#run-tests').disabled=true;const dialog=$('#budget-warning-dialog');if(!dialog.open)dialog.showModal();
}
$('#close-budget-warning').onclick=()=>$('#budget-warning-dialog').close();
$('#budget-keep-allowance').onclick=()=>$('#budget-warning-dialog').close();
$('#budget-edit-plan').onclick=()=>{$('#budget-warning-dialog').close();$('#edit-test-plan').onclick();$('#evaluation-allowance').focus();$('#evaluation-allowance').scrollIntoView({block:'center'});};
$('#budget-warning-dialog').addEventListener('close',()=>{$('#run-tests').disabled=budgetWarningBlocked||comparisonsRunning||!evaluationPlan?.approved||!preflight?.canRun||evaluationFinished();});
function renderFinish(){
 if(!evaluationFinished())return;
 const report=PromptimizeMetrics.summarize(analysis,evaluationPlan,results);
 $('#finish-status').textContent=!report.qualityPassed?'Some reviewed checks failed. Inspect the evidence before adopting this candidate.'
  :report.decision==='cost-unverified'?'Behavior checks passed. Cost evidence still needs review.'
  :report.decision==='do-not-adopt'?'Behavior checks passed, but this run did not establish lower task cost.'
  :'Your promptbase and test evidence are ready to download.';
 $('#finish-summary').textContent=`${report.baseline.passed}/${report.expectedPairs} old checks passed · ${report.candidate.passed}/${report.expectedPairs} candidate checks passed · snapshot ${analysis.sha256.slice(0,12)}`;
 $('#finish-zip').textContent=report.qualityPassed?'Download folder ZIP ↓':'Download review bundle ↓';
 $('#finish-mark').innerHTML=report.qualityPassed?'<svg viewBox="0 0 64 64" fill="none"><path d="M18 33l9 9 20-23" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  :'<svg viewBox="0 0 64 64" fill="none"><path d="M32 12v28m-10-9 10 10 10-10M14 43v9h36v-9" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 for(const id of ['finish-zip','finish-md','finish-json','finish-evidence'])$('#'+id).disabled=false;
}
function focusFinish(){if(!$('#simulation-dialog').open)$('#finish-title').focus({preventScroll:true});}
function enterFinish(){if(!evaluationFinished())return;renderFinish();show('finish');focusFinish();}
$('#finish-back').onclick=()=>show('tests');
for(const [target,source]of [['finish-zip','export-zip'],['finish-md','export-md'],['finish-json','export'],['finish-evidence','download-evaluation']]){
 $('#'+target).onclick=async()=>{const button=$('#'+target),label=button.textContent;button.disabled=true;button.textContent='Preparing download…';
  try{await $('#'+source).onclick();}catch(e){$('#finish-status').textContent=e.message;}finally{button.disabled=false;button.textContent=label;}
 };
}
$('#finish-another').onclick=()=>{
 if(comparisonsRunning)return;
 setFiles([],false);iterationHistory=[];sessionStorage.removeItem('promptimize-session');dismissedTraceSuccess.clear();budgetWarningBlocked=false;
 $('#folder').value='';$('#file-select').value='';renderTestPlan();syncStepReadiness();
 if(typeof window!=='undefined')window.scrollTo({top:0,behavior:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 $('#intro-title').focus({preventScroll:true});
};
function refreshTraceSuccess(){
 const key=[analysis?.sha256,evaluationPlan?.sha256,simCaseId].join(':');
 const finalFrame=!Number.isFinite(simFrame)||simFrame>=maxSimSteps()-1;
 $('#trace-success').hidden=!$('#simulation-dialog').open||!finalFrame||dismissedTraceSuccess.has(key)
  ||!PromptimizeMetrics.traceMatches(getSimulationRow(),analysis?.sha256,evaluationPlan?.approved?evaluationPlan.sha256:null);
}
$('#dismiss-trace-success').onclick=()=>{dismissedTraceSuccess.add([analysis?.sha256,evaluationPlan?.sha256,simCaseId].join(':'));$('#trace-success').hidden=true;};
const originalRefreshSimulation=refreshSimulation;
refreshSimulation=function(){originalRefreshSimulation();refreshTraceSuccess();};
$('#simulation-dialog').addEventListener('close',()=>{if(evaluationFinished()&&$('#finish').classList.contains('active'))focusFinish();});
function lockEvaluation(active){
 for(const id of ['sample','hero-start','folder','file-select','analyze','new-proposal'])$('#'+id).disabled=active;
 if(!active)$('#analyze').disabled=!files.length;
 document.querySelectorAll('.step').forEach(button=>{if(active&&button.dataset.step!=='tests')button.disabled=true;});
 if(!active)syncStepReadiness();
}
function resetEvaluationIfChanged(){
 if(evaluationPlan&&evaluationPlan.snapshot!==analysis?.sha256){evaluationHistory.push({analysis,plan:evaluationPlan,results:structuredClone(results)});evaluationPlan=null;preflight=null;}
}
const originalRenderAnalysis=renderAnalysis;
const originalRenderBundle=renderBundle;
renderBundle=function(){originalRenderBundle();renderTestPlan();};
renderAnalysis=function(){resetEvaluationIfChanged();originalRenderAnalysis();};
function renderTestPlan(){
 const plan=evaluationPlan,locked=!!plan?.approved;
 $('#build-test-plan').disabled=!approved||bundleReady?.snapshot!==analysis?.sha256||comparisonsRunning;
 $('#test-plan-editor').hidden=!plan;
 $('#case-list').hidden=!!plan&&!locked;
 $('#preflight').disabled=!locked||bundleReady?.snapshot!==analysis?.sha256||comparisonsRunning;
 $('#run-tests').disabled=!locked||!preflight?.canRun||comparisonsRunning;
 if(!plan){$('#test-plan-status').textContent='Build a plan from the original rules. This uses no model calls.';return;}
 $('#evaluation-repetitions').value=String(plan.repetitions);$('#evaluation-allowance').value=plan.budgetLimit;
 $('#evaluation-repetitions').disabled=locked;$('#evaluation-allowance').disabled=locked;
 const selected=plan.cases.filter(test=>test.enabled),covered=new Set(selected.flatMap(test=>test.ruleIds));
 $('#test-plan-status').textContent=`${selected.length} selected cases · ${selected.filter(test=>test.partition==='holdout').length} holdout cases · ${covered.size}/${analysis.rules.length} rules have declared coverage. ${locked?'Plan approved and frozen.':'Inspect the original rules and expected outcomes, then approve.'}`;
 $('#test-plan-cases').innerHTML=plan.cases.map((test,index)=>{
  const refs=test.ruleIds.map(id=>{const rule=analysis.rules.find(rule=>rule.id===id);return rule?`${id} · ${rule.file}:${rule.line}`:id;});
  return `<details class="evaluation-case"><summary><label><input type="checkbox" data-include-case="${index}" ${test.enabled?'checked':''} ${locked?'disabled':''}>${escape(test.id+' · '+test.name)}</label><span>${escape(test.partition)}</span></summary><div class="evaluation-case-body"><p><strong>Request</strong> ${escape(test.query)}</p><p><strong>Expected</strong> <code>${escape(test.expected)}${test.field?' · '+escape(test.field+'='+test.value):''}</code></p><details><summary>Inspect declared source coverage (${refs.length})</summary>${test.ruleIds.map(id=>{const rule=analysis.rules.find(rule=>rule.id===id);return rule?`<blockquote><code>${escape(id+' · '+rule.file+':'+rule.line)}</code><p>${escape(rule.quote)}</p></blockquote>`:'';}).join('')||'<p class="hint">No source rule has been linked yet. Add ruleIds after inspecting the original audit.</p>'}</details><details><summary>Edit request, assertions and source links</summary><label for="evaluation-case-${index}">Case JSON</label><textarea id="evaluation-case-${index}" data-edit-case="${index}" rows="10" spellcheck="false" ${locked?'disabled':''}>${escape(JSON.stringify(test,null,2))}</textarea></details></div></details>`;
 }).join('');
 $('#approve-test-plan').disabled=locked||comparisonsRunning;$('#approve-test-plan').classList.toggle('ready-action',!locked);
 $('#test-plan-cases').hidden=locked;$('#approve-test-plan').hidden=locked;$('#add-test-case').hidden=locked;
 $('#edit-test-plan').disabled=!locked||comparisonsRunning;$('#add-test-case').disabled=locked||comparisonsRunning||plan.cases.length>=24;$('#add-test-case').title='At most 24 cases per reviewed plan';
 $('#build-test-plan').disabled=!!plan||comparisonsRunning;
}
$('#build-test-plan').onclick=async()=>{
 const button=$('#build-test-plan');button.disabled=true;
 try{const response=await post('/api/evaluation-plan',{files,analysis});
  if(results.length)evaluationHistory.push({analysis,plan:evaluationPlan,results:structuredClone(results)});
  evaluationPlan=response.plan;results=[];preflight=null;renderAnalysis();renderResults();saveSession();
 }catch(e){$('#test-plan-status').textContent=e.message;button.disabled=false;}
};
$('#edit-test-plan').onclick=()=>{
 if(comparisonsRunning)return;
 if(results.length)evaluationHistory.push({analysis:structuredClone(analysis),plan:structuredClone(evaluationPlan),results:structuredClone(results)});
 evaluationPlan={...evaluationPlan,approved:false};results=[];preflight=null;renderAnalysis();renderResults();saveSession();
};
$('#add-test-case').onclick=()=>{
 try{evaluationPlan=readEvaluationDraft();const copy=structuredClone(evaluationPlan.cases[0]);let number=1;while(evaluationPlan.cases.some(test=>test.id==='C'+number))number++;
 Object.assign(copy,{id:'C'+number,name:'New reviewed case',enabled:false,partition:'development',ruleIds:[]});evaluationPlan.cases.push(copy);renderTestPlan();}
 catch(e){$('#test-plan-status').textContent=e.message;}
};
function readEvaluationDraft(){
 const next=structuredClone(evaluationPlan);
 next.cases=next.cases.map((test,index)=>({...JSON.parse($(`[data-edit-case="${index}"]`).value),enabled:$(`[data-include-case="${index}"]`).checked}));
 next.repetitions=Number($('#evaluation-repetitions').value);next.budgetLimit=Number($('#evaluation-allowance').value);return next;
}
$('#approve-test-plan').onclick=async()=>{
 const button=$('#approve-test-plan');button.disabled=true;
 try{
  const next=readEvaluationDraft();
  const response=await post('/api/evaluation-plan',{action:'approve',files,analysis,plan:next});evaluationPlan=response.plan;preflight=null;results=[];
  renderAnalysis();renderResults();saveSession();$('#preflight').classList.add('ready-action');
 }catch(e){$('#test-plan-status').textContent=e.message;button.disabled=false;}
};
$('#preflight').onclick=async()=>{
 const button=$('#preflight');button.disabled=true;$('#budget').textContent='Sizing the approved cases and repetitions. No test answers are being generated…';
 try{
  const sized=await post('/api/evaluation-preflight',{files,analysis,plan:evaluationPlan});
  if(!evaluationPlan?.approved||sized.planHash!==evaluationPlan.sha256||sized.snapshot!==analysis?.sha256)throw Error('The plan changed during sizing. Approve and size the current plan again.');
  preflight=sized;budgetWarningBlocked=false;
  const unresolved=preflight.requests.filter(row=>row.unresolved);
  $('#budget').textContent=`Old ${preflight.baselineInitialInput.toLocaleString()} initial input tokens · candidate ${preflight.candidateInitialInput.toLocaleString()}. Reserve ${preflight.reservedTokens.toLocaleString()} / ${preflight.budgetLimit.toLocaleString()} tokens for all runs and bounded lookups. ${preflight.canRun?'Ready.':unresolved.length?unresolved.length+' requests need state, evidence or a smaller per-call context.':'Blocked: no input reduction or the allowance is too small.'} Sizing is not exact billing.`;
  $('#run-tests').disabled=!preflight.canRun;$('#run-tests').classList.toggle('ready-action',preflight.canRun);saveSession();
  if(preflight.reservedTokens>preflight.budgetLimit||preflight.canRun)showBudgetWarning(preflight.reservedTokens,preflight.budgetLimit);
 }catch(e){preflight=null;$('#run-tests').disabled=true;$('#budget').textContent=e.message;}finally{button.disabled=!evaluationPlan?.approved;}
};
function reservedSoFar(){return results.reduce((n,row)=>n+[row.baseline,row.candidate,...(row.attempts||[])].filter(Boolean).reduce((sum,result)=>sum+Math.max(result.measurement?.reservedTokens||0,result.usage?.total_tokens||0),0),0);}
$('#run-tests').onclick=async()=>{
 if(!approved||bundleReady?.snapshot!==analysis?.sha256||!evaluationPlan?.approved||!preflight?.canRun||preflight.planHash!==evaluationPlan.sha256||preflight.snapshot!==analysis.sha256||comparisonsRunning||budgetWarningBlocked||$('#budget-warning-dialog').open)return;
 comparisonsRunning=true;lockEvaluation(true);const button=$('#run-tests');button.disabled=true;$('#preflight').disabled=true;$('#live-view').disabled=false;let stopped='';renderTestPlan();
 try{
  for(const test of getCases()){
   let row=results.find(row=>row.case.id===test.id);if(!row){row={case:test,attempts:[]};results.push(row);}
   for(const mode of ['baseline','candidate']){
    if(isComplete(row[mode]))continue;
    const quote=preflight.requests.find(request=>request.caseId===test.baseId&&request.mode===mode);
    const remaining=evaluationPlan.budgetLimit-reservedSoFar();
    if(!quote||quote.unresolved||quote.reservedTokens>remaining)throw Error('The remaining reserved allowance cannot cover another attempt. No additional call started.');
    if(row[mode]){row.attempts.push(row[mode]);delete row[mode];}
    currentRunCase=test.id;currentRunSide=mode;$(`#${test.id} .state`).textContent='Running '+mode+'…';refreshSimulation();
    row[mode]={status:'incomplete',pass:null,mode,snapshot:analysis.sha256,planHash:evaluationPlan.sha256,reason:'This attempt has no final receipt yet.',
     measurement:{reservedTokens:quote.reservedTokens,calls:[{stage:'in-flight-request',mode,status:'unknown',model:'muse-spark-1.3',usage:{},usageKnown:false,reservedTokens:quote.reservedTokens}]}};saveSession();
    try{row[mode]=await post('/api/evaluation-case',{files,analysis,plan:evaluationPlan,caseId:test.baseId,repetition:test.repetition,mode,remainingTokens:remaining});}
    catch(e){row[mode]={status:'incomplete',pass:null,mode,snapshot:analysis.sha256,planHash:evaluationPlan.sha256,reason:e.message,
     measurement:{reservedTokens:e.data?.providerAttempted===false?0:quote.reservedTokens,calls:e.data?.providerAttempted===false?[]:[{stage:'unreceived-request',mode,status:'unknown',model:'muse-spark-1.3',usage:{},usageKnown:false,reservedTokens:quote.reservedTokens}]}};}
    updateCaseState(row);saveSession();renderResults();
    if(!isComplete(row[mode]))throw Error(row[mode].reason||'A request did not complete.');
   }
  }
 }catch(e){stopped=e.message;}finally{
  comparisonsRunning=false;lockEvaluation(false);currentRunCase=null;currentRunSide=null;renderResults();renderTestPlan();$('#preflight').disabled=false;
  const done=results.length===getCases().length&&results.every(row=>isComplete(row.baseline)&&isComplete(row.candidate));
  const firstPending=getCases().flatMap(test=>['baseline','candidate'].map(mode=>({test,mode}))).find(({test,mode})=>!isComplete(results.find(row=>row.case.id===test.id)?.[mode]));
  const nextReserve=firstPending&&preflight.requests.find(request=>request.caseId===firstPending.test.baseId&&request.mode===firstPending.mode)?.reservedTokens;
  button.disabled=done||nextReserve>evaluationPlan.budgetLimit-reservedSoFar();button.textContent=done?'Comparison complete':button.disabled?'Allowance exhausted':'Resume unfinished comparisons';
  if(stopped)$('#results').insertAdjacentHTML('beforeend',`<p class="failure">${escape(stopped)} Completed results and all attempt receipts are retained. Resume is an explicit retry within the remaining allowance.</p>`);
  if(!done&&nextReserve>evaluationPlan.budgetLimit-reservedSoFar())showBudgetWarning(nextReserve,Math.max(0,evaluationPlan.budgetLimit-reservedSoFar()),true);
  if(done)enterFinish();saveSession();
 }
};
function downloadEvaluation(data){const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.download='promptimize-evaluation.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
renderResults=function(){
 $('#live-view').disabled=!comparisonsRunning&&!results.some(row=>row.baseline||row.candidate);document.querySelectorAll('[data-open-case]').forEach(button=>button.disabled=!results.find(row=>row.case.id===button.dataset.openCase&&(row.baseline||row.candidate)));refreshSimulation();
 if(!evaluationPlan){$('#results').innerHTML='';return;}
 const report=PromptimizeMetrics.summarize(analysis,evaluationPlan,results),old=report.baseline,next=report.candidate;
 const change=old.totalTokens?Math.round((next.totalTokens/old.totalTokens-1)*100):null;
 const labels={'incomplete':'Comparison unfinished','do-not-adopt':'Do not adopt this candidate','cost-unverified':'Behavior checked; cost evidence is incomplete','eligible-for-review':'Selected checks pass with lower estimated task cost'};
 const rows=[['Development cases passed',report.partitions.development.baseline.passed,report.partitions.development.candidate.passed],['Holdout cases passed',report.partitions.holdout.baseline.passed,report.partitions.holdout.candidate.passed],['Input tokens',old.inputTokens,next.inputTokens],['Output tokens, including reasoning',old.outputTokens,next.outputTokens],['Reported reasoning within output',old.reasoningTokens,next.reasoningTokens],['Reported cached input',old.cachedInputTokens,next.cachedInputTokens],['Generation attempts',old.calls,next.calls],['Unknown-usage attempts',old.unknownUsageCalls,next.unknownUsageCalls],['Explicit retries',old.retries,next.retries],['Local fallback expansions',old.fallbackExpansions,next.fallbackExpansions],['Median latency',evaluationTime(old.p50LatencyMs),evaluationTime(next.p50LatencyMs)],['p95 latency, small sample',evaluationTime(old.p95LatencyMs),evaluationTime(next.p95LatencyMs)],['Local retrieval time',evaluationTime(old.retrievalMs),evaluationTime(next.retrievalMs)],['Sizing time',evaluationTime(old.sizingMs),evaluationTime(next.sizingMs)]];
 const failures=results.filter(row=>row.candidate?.pass===false||row.baseline?.pass===false);
 const histories=evaluationHistory.map(entry=>entry.plan?PromptimizeMetrics.summarize(entry.analysis,entry.plan,entry.results):null).filter(Boolean);
 $('#results').innerHTML=`<div class="summary">${labels[report.decision]} · ${old.completed}/${report.expectedPairs} old and ${next.completed}/${report.expectedPairs} candidate runs completed</div><div class="metrics"><div class="metric"><strong>${old.passed}/${report.expectedPairs}</strong><span>Old behavior passed</span></div><div class="metric"><strong>${next.passed}/${report.expectedPairs}</strong><span>Candidate behavior passed</span></div><div class="metric"><strong class="${change===null||change===0?'':change<0?'token-good':'token-bad'}">${change===null?'—':(change>0?'+':'')+change+'%'}</strong><span>Recorded task tokens, including incomplete attempts</span></div></div><div class="measurement-summary"><p><strong>Old tasks ${evaluationMoney(old.costUSD)}</strong><span>Candidate tasks ${evaluationMoney(next.costUSD)}</span></p><p>One-time optimizer: ${evaluationMoney(report.optimizer.costUSD)} · ${report.optimizer.totalTokens.toLocaleString()} reported tokens. Estimated experiment total: ${evaluationMoney(report.totalExperimentEstimateUSD)}.</p><p>Optimizer break-even: ${report.breakEvenRequests===null?'not established':report.breakEvenRequests+' similar future requests'}. ${histories.length?histories.length+' earlier test plans retained in the evidence download.':''}</p></div><details class="measurement-detail"><summary>Inspect complete measurements</summary><div class="measurement-table"><table><thead><tr><th>Measurement</th><th>Old</th><th>Candidate</th></tr></thead><tbody>${rows.map(([label,before,after])=>`<tr><td>${label}</td><td>${escape(before)}</td><td>${escape(after)}</td></tr>`).join('')}</tbody></table></div><p class="hint">Routing and context expansion are local operations with zero provider calls. Their loaded input is counted in classification. No automatic retries. Simulated tools do not incur production tool fees.</p><p class="hint">USD estimates use <a href="${report.pricing.source}" target="_blank" rel="noreferrer">Meta Standard rates</a>, checked ${report.pricing.verified}. Missing cache counts use the uncached rate. Reasoning is already included in output. Estimates are not invoices.</p></details>${failures.map(row=>`<div class="failure">Next proposal · ${escape(row.case.id)}: ${escape(row.candidate?.failureReason||row.baseline?.failureReason||'A reviewed expectation failed.')}. Investigate source, state and dependencies before proposing a fix.</div>`).join('')}<div class="actions"><span class="hint">Declared rule coverage and a small test suite do not prove every source behavior is preserved.</span><button id="download-evaluation" class="secondary">Download test evidence</button></div>`;
 $('#download-evaluation').onclick=()=>downloadEvaluation({report,preflight,plan:evaluationPlan,results,previousPlans:evaluationHistory,previousPlanReports:histories});
};
renderTestPlan();if(analysis&&evaluationPlan){renderResults();renderFinish();syncStepReadiness();}

const originalNextProposal=$('#new-proposal').onclick;
$('#new-proposal').onclick=()=>{
 const notes=results.flatMap(row=>['baseline','candidate'].filter(mode=>row[mode]?.pass===false).map(mode=>{
  const result=row[mode],investigation=result.investigation;
  return `${row.case.id} / ${mode}: ${result.failureReason||'Reviewed expectation failed.'}\nSource rules: ${(investigation?.sourceRuleIds||row.case.ruleIds||[]).join(', ')}\n${(investigation?.inspect||['Inspect the source, request state and dependency selection.']).join('\n')}`;
 }));
 originalNextProposal();
 if(notes.length){$('#review-notes').value+=('\n\nCarry forward for investigation, not an automatic patch:\n'+notes.join('\n\n'));correctionChanged();}
};
