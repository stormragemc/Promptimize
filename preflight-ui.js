(function(root,factory){const view=factory();if(typeof module==='object'&&module.exports)module.exports=view;else root.PromptimizePreflight=view;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={'missing-rule-state':'Required test state is missing','missing-relation-state':'A dependency needs test state','context-conflict':'Project context conflicts with a source rule',contradiction:'Source rules need review','relation-unresolved':'A rule dependency needs review','execution-token-budget-exceeded':'A request exceeds its token allowance','suite-budget-exceeded':'The full test allowance is too small','no-input-reduction':'The candidate is not smaller on these requests','context-budget-exceeded':'Selected context is too large','missing-source':'Source instructions could not be selected','missing-required-rule':'A required rule is missing','no-cases':'No supported cases were found'};
 function budgetMarkup(data){
  const complete=data.inputSizingComplete!==false;
  const counts=complete?`Original ${esc(data.baselineInitialInput)} input tokens · candidate ${esc(data.candidateInitialInput)}. Full reserve ${esc(data.reservedTokens)} / ${esc(data.budgetLimit)} tokens, including output caps.`:`Sizing incomplete. ${data.caseChecks?.filter(c=>c.ready).length??0} of ${data.caseChecks?.length??0} requests could be prepared. A full comparison total is unavailable; missing requests have not been counted as zero.`;
  const blockers=data.blockers||[];
  return `<h3>${data.canRun?'Ready to compare':complete?'Comparisons are blocked':'Some test cases need attention'}</h3><p>${counts}</p>${blockers.length?`<ul class="preflight-blockers">${blockers.map(b=>`<li><strong>${esc(labels[b.code]||'Test context is unresolved')}</strong>${b.caseId?`<span>${esc(b.caseId)} · ${esc(b.caseName||'')} · ${b.mode==='candidate'?'Candidate':'Original'} · ${b.stage==='followup'?'after lookup':'initial request'}</span>`:''}<p>${b.field?`Missing field: <code>${esc(b.field)}</code>. Expand this case’s test setup and supply its documented state. If this field is not part of your app, reanalyze its routing instead of inventing a value.`:esc(b.detail)}</p>${b.evidence?.length?`<details><summary>Inspect affected rules</summary>${b.evidence.map(r=>`<p><strong>${esc(r.id)}</strong> · ${esc(r.file)}:${esc(r.line)}</p><blockquote>${esc(r.quote)}</blockquote>`).join('')}</details>`:''}${b.field?`<button class="secondary" data-test-setup="${esc(b.caseId)}" data-test-stage="${esc(b.stage)}">Review this test setup</button><button class="secondary" data-reanalyze-routing>Reanalyze routing in a next proposal</button>`:''}${['context-conflict','contradiction','relation-unresolved'].includes(b.code)?'<button class="secondary" data-review-blocker>Create next proposal to review rules</button>':''}</li>`).join('')}</ul>`:''}<p class="hint">${esc(data.note||'Sizing is not exact billing. No test responses have been generated.')}</p>`;
 }
 return {esc,budgetMarkup};
});
if(typeof window!=='undefined'){
 const reviewedFlow=typeof evaluationPlan!=='undefined';
 let setupErrors=new Set(),preflightBusy=false;
 const byId=id=>document.getElementById(id);
 const esc=PromptimizePreflight.esc;
 function clearReadiness(preserveResults=false){
  preflight=null;byId('run-tests').disabled=true;byId('run-tests').classList.remove('ready-action');
  byId('budget').textContent='Test setup changed. Check the token budget again; the frozen prompt has not changed.';
  if(results.length&&!preserveResults){iterationHistory.push({kind:'test-setup-revision',analysis:structuredClone(analysis),results:structuredClone(results),frozen:approved});results=[];byId('results').innerHTML='';document.querySelectorAll('[data-open-case]').forEach(b=>b.disabled=true);byId('live-view').disabled=true;refreshSimulation();}
 }
 window.renderTestSetups=function(){
  if(reviewedFlow)return;
  setupErrors.clear();
  if(!comparisonBudgetEdited)comparisonBudget=analysis?.adapter==='jd-viewer-v1'?100000:30000;
  byId('comparison-budget').value=comparisonBudget;
  if(!analysis||analysis.adapter==='jd-viewer-v1')return;
  for(const c of getCases()){
   const row=byId(c.id);if(!row||row.querySelector('.test-setup'))continue;
   const block=document.createElement('details');block.className='test-setup';
   block.innerHTML=`<summary>Test setup</summary><p>These are facts for this scenario, supplied equally to both versions. Keep them consistent with the request. Editing them does not edit your frozen prompt.</p><p class="test-request">${esc(c.query)}</p><label for="state-${c.id}">Application state before the request</label><textarea id="state-${c.id}" data-test-state="${c.id}" data-stage="initial" spellcheck="false" rows="5">${esc(JSON.stringify(c.context,null,2))}</textarea>${c.tool?`<label for="followup-${c.id}">Application state after the successful simulated lookup</label><textarea id="followup-${c.id}" data-test-state="${c.id}" data-stage="followup" spellcheck="false" rows="5">${esc(JSON.stringify(c.followupContext,null,2))}</textarea>`:''}<p class="test-state-error" role="status"></p>`;
   row.append(block);
  }
 };
 byId('case-list').addEventListener('input',event=>{
  const input=event.target,id=input.dataset.testState;if(!id||comparisonsRunning||preflightBusy)return;
  const key=id+':'+input.dataset.stage,error=input.closest('.test-setup').querySelector('.test-state-error');
  clearReadiness();
  try{
   const value=PromptimizeSample.state(JSON.parse(input.value)),field=input.dataset.stage==='followup'?'followupContext':'context';
   testSetups={...testSetups,[id]:{...(testSetups[id]||{}),[field]:value}};
   setupErrors.delete(key);error.textContent='';saveSession();
   byId('test-setup-notice').textContent='Test facts saved. Check the token budget again before running.';
  }catch(e){setupErrors.add(key);error.textContent=e.message;byId('test-setup-notice').textContent='Correct the highlighted JSON before checking the budget.';}
  byId('preflight').disabled=setupErrors.size>0;
 });
 byId('comparison-budget').addEventListener('input',event=>{comparisonBudget=Number(event.target.value);comparisonBudgetEdited=true;clearReadiness(true);const valid=Number.isInteger(comparisonBudget)&&comparisonBudget>=1000&&comparisonBudget<=200000;if(!valid){setupErrors.add('budget');byId('test-setup-notice').textContent='Enter a total allowance of 1,000–200,000 tokens.';}else{setupErrors.delete('budget');byId('test-setup-notice').textContent='Allowance changed. Check the token budget again before starting.';saveSession();}byId('preflight').disabled=setupErrors.size>0;});
 window.lockTestSetups=function(locked){byId('comparison-budget').disabled=locked;document.querySelectorAll('[data-test-state]').forEach(el=>el.disabled=locked);};
 byId('budget').addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.testSetup){
   if(reviewedFlow){if(evaluationPlan?.approved)byId('edit-test-plan').onclick();const index=evaluationPlan?.cases.findIndex(c=>c.id===button.dataset.testSetup);const input=document.querySelector('[data-edit-case="'+index+'"]');if(input){input.closest('.evaluation-case').open=true;input.closest('details').open=true;input.focus();input.scrollIntoView({block:'center'});}return;}
   const row=byId(button.dataset.testSetup),details=row?.querySelector('.test-setup');if(!details)return;
   details.open=true;const input=details.querySelector(button.dataset.testStage==='followup'?'[data-stage="followup"]':'[data-stage="initial"]');
   input?.focus();details.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }else if(button.hasAttribute('data-reanalyze-routing')){
   if(approved)byId('new-proposal').click();show('input');
  }else if(button.hasAttribute('data-review-blocker')){
   if(approved)byId('new-proposal').click();show('review');
  }
 });
 if(!reviewedFlow)byId('preflight').onclick=async()=>{
  if(!analysis||setupErrors.size||comparisonsRunning)return;
  const snapshot=analysis;preflightBusy=true;lockTestSetups(true);byId('preflight').disabled=true;byId('run-tests').disabled=true;byId('budget').textContent='Checking all case states and counting their requests with Meta. No test responses are being generated…';
  try{
   const next=await post('/api/preflight',{files,analysis,testSetups,comparisonBudget});if(analysis!==snapshot)return;
   preflight=next;byId('budget').innerHTML=PromptimizePreflight.budgetMarkup(next);byId('run-tests').disabled=!next.canRun;byId('run-tests').classList.toggle('ready-action',next.canRun);
   for(const c of getCases()){
    const state=byId(c.id)?.querySelector('.state');if(!state)continue;
    if(!results.some(r=>r.case.id===c.id))state.textContent=next.blockers?.some(b=>b.caseId===c.id)?'Needs attention':'Ready';
   }
  }catch(e){if(analysis===snapshot){preflight=null;byId('budget').textContent=e.message;}}
  finally{preflightBusy=false;lockTestSetups(false);byId('preflight').disabled=setupErrors.size>0;}
 };
 window.renderConflictReview=function(){
  const container=byId('semantic-review-items');if(!container)return;
  const items=(analysis?.semantic?.reviewItems||[]).filter(x=>['context-conflict','contradiction','relation-unresolved'].includes(x.type));
  container.innerHTML=items.length?`<h3>Review blocking findings</h3><p>Decide from the original evidence. Your decision applies only to these source rules and this candidate text.${approved?' Create a next proposal to record changes.':''}</p>`+items.map((item,index)=>{
   const ids=item.ruleIds||(item.ruleId?[item.ruleId]:[]),rules=analysis.rules.filter(r=>ids.includes(r.id)),canResolve=item.type!=='context-conflict'&&rules.length===ids.length&&ids.length>0;
   return `<details class="conflict-review" data-conflict-index="${index}"><summary>${esc(item.type.replaceAll('-',' '))} · ${esc(ids.join(', ')||'project context')}</summary><p>${esc(item.rationale||'Review the affected rules and their source evidence.')}</p>${rules.map(r=>`<p>${esc(r.id)} · ${esc(r.file)}:${esc(r.line)}</p><blockquote>${esc(r.quote)}</blockquote>`).join('')}${canResolve?`<label for="conflict-action-${index}">Review decision</label><select id="conflict-action-${index}" data-conflict-action="${esc(item.id)}" ${approved?'disabled':''}><option value="">Keep pending</option><option value="dismiss-false-positive">The source rules are compatible; this is a false positive</option><option value="corrected-candidate">I corrected the affected instruction above</option></select><label for="conflict-note-${index}">Explain your decision using the source evidence</label><textarea id="conflict-note-${index}" data-conflict-note="${esc(item.id)}" rows="3" maxlength="2000" ${approved?'disabled':''}></textarea>`:'<p>Update the project context or reanalyze the source to resolve this finding. It cannot be dismissed here.</p>'}</details>`;
  }).join(''):'';
 };
 window.conflictReviewDraft=function(){
  const resolutions=[];
  document.querySelectorAll('[data-conflict-action]').forEach(select=>{
   if(!select.value)return;
   const conflictId=select.dataset.conflictAction,item=analysis.semantic.reviewItems.find(x=>x.id===conflictId),ids=item.ruleIds||(item.ruleId?[item.ruleId]:[]),rationale=document.querySelector(`[data-conflict-note="${conflictId}"]`).value.trim();
   if(!rationale)throw Error('Explain each selected conflict decision before saving.');
   resolutions.push({conflictId,action:select.value,rationale,evidence:ids.map(id=>analysis.rules.find(r=>r.id===id).sources[0].id)});
  });
  return resolutions.length?{conflictResolutions:resolutions}:{};
 };
 byId('semantic-review-items').addEventListener('input',correctionChanged);
 byId('semantic-review-items').addEventListener('change',correctionChanged);
 renderTestSetups();renderConflictReview();
}
