const {selectionReceipt,EXECUTION_TOKEN_BUDGET,OUTPUT_RESERVE}=require('./_semantic-runtime');
function report(a,executions,budgetLimit,bindings={}){
 const incomplete=executions.some(r=>r.tokens===null);
 const sum=mode=>executions.filter(r=>r.mode===mode).reduce((n,r)=>n+(r.tokens??0)*(r.weight??1),0);
 const complete=mode=>executions.filter(r=>r.mode===mode).every(r=>r.tokens!==null);
 const baseline=sum('baseline'),candidate=sum('candidate'),generationCallsMax=executions.reduce((n,r)=>n+(r.weight??1),0);
 const knownReserved=baseline+candidate+generationCallsMax*OUTPUT_RESERVE;
 const blockers=[];const planRules=a.rules||[];
 function add(run,reason){
  const field=['missing-rule-state','missing-relation-state'].includes(reason.code)?reason.detail:null;
  const ruleIds=field?planRules.filter(rule=>(rule.conditions||[]).some(c=>c.field===field)||a.semantic?.assignments?.some(x=>x.ruleId===rule.id&&x.conditions?.some(c=>c.field===field))||a.semantic?.relations?.some(x=>(x.from===rule.id||x.to===rule.id)&&x.conditions?.some(c=>c.field===field))).map(r=>r.id):String(reason.detail||'').split(',').filter(id=>planRules.some(r=>r.id===id));
  blockers.push({caseId:run.caseId,caseName:run.caseName,mode:run.mode,stage:run.stage||'initial',code:reason.code,detail:reason.detail||'',ruleIds,evidence:planRules.filter(r=>ruleIds.includes(r.id)).map(r=>({id:r.id,file:r.file,line:r.line,quote:r.quote})),...(field?{field}:{})});
 }
 for(const run of executions){
  if(run.tokens===null){const reasons=run.selection?.unresolved?.length?run.selection.unresolved:[{code:'unresolved-context',detail:'No request could be prepared.'}];reasons.forEach(r=>add(run,r));}
  else if(run.tokens+OUTPUT_RESERVE>EXECUTION_TOKEN_BUDGET)add(run,{code:'execution-token-budget-exceeded',detail:`${run.tokens+OUTPUT_RESERVE} required; ${EXECUTION_TOKEN_BUDGET} allowed per call`});
 }
 if(!incomplete&&candidate>=baseline)blockers.push({code:'no-input-reduction',detail:`Candidate ${candidate}; original ${baseline}.`,ruleIds:[],evidence:[]});
 if(!incomplete&&knownReserved>budgetLimit)blockers.push({code:'suite-budget-exceeded',detail:`${knownReserved} required; ${budgetLimit} allowed.`,ruleIds:[],evidence:[],shortfall:knownReserved-budgetLimit});
 if(!executions.length)blockers.push({code:'no-cases',detail:'No supported test cases were found.',ruleIds:[],evidence:[]});
 return {snapshot:a.sha256,baselineInitialInput:complete('baseline')?baseline:null,candidateInitialInput:complete('candidate')?candidate:null,knownBaselineInput:baseline,knownCandidateInput:candidate,inputSizingComplete:!incomplete,reservedTokens:incomplete?null:knownReserved,knownReservedTokens:knownReserved,budgetLimit,generationCallsMax,caseBindings:bindings,canRun:executions.length>0&&!blockers.length,blockers,unresolvedCases:executions.filter(r=>r.tokens===null||r.tokens+OUTPUT_RESERVE>EXECUTION_TOKEN_BUDGET).map(r=>({caseId:r.caseId,mode:r.mode,stage:r.stage,...(r.selection?{contextSelection:selectionReceipt(r.selection)}:{inputTokens:r.tokens})})),caseChecks:executions.map(r=>({caseId:r.caseId,caseName:r.caseName,mode:r.mode,stage:r.stage||'initial',inputTokens:r.tokens,ready:r.tokens!==null&&r.tokens+OUTPUT_RESERVE<=EXECUTION_TOKEN_BUDGET})),note:incomplete?'Sizing is incomplete. Missing requests are not counted as zero tokens. No test responses were generated.':'Every initial request and bounded lookup follow-up was sized. Output caps are reserved. Sizing is not exact billing.'};
}
module.exports={report};
