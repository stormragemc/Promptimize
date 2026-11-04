let architectureImage=null,projectionSnapshot=null;
let contextDocuments=[],contextFacts=[],contextReceipt=null,architectureReport=null,advisorBusy=false,contextReadSequence=0,advisorSequence=0,analyzedContext=null;
const ad=id=>document.getElementById(id);
const adEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function contextPayload(){
 const purpose=ad('project-purpose').value.trim(),approved=ad('context-approved').checked;
 if(!purpose&&!contextFacts.length)return {};
 const authority=approved?'user-approved':'inferred';
 const projectContext={schemaVersion:1,projectId:'uploaded-project',version:'1',status:approved?'approved':'draft',authority,actors:[],workflowHints:[],tools:[],outputs:[],stateFields:[],invariants:[],exceptions:[],references:[]};
 if(purpose)projectContext.purpose=purpose;
 const fields={actor:'actors',workflow:'workflowHints',tool:'tools',output:'outputs',stateField:'stateFields'};
 const promptContext=[];
 for(const fact of contextFacts){
  if(fields[fact.kind])projectContext[fields[fact.kind]].push(fact.text);
  if(fact.kind==='invariant'||fact.kind==='exception')projectContext[fact.kind==='invariant'?'invariants':'exceptions'].push({id:fact.id,text:fact.text,authority});
  if(fact.kind==='prompt')promptContext.push({schemaVersion:1,version:'1',sourceFile:fact.promptFile,component:fact.id,purpose:fact.text,authority});
  projectContext.references.push({id:fact.id,title:`${fact.source.file}:${fact.source.line}`,text:fact.text+'\nSource: '+fact.source.quote,authority});
 }
 return {projectContext,promptContext};
}
function advisorBeforeAnalyze(){
 if(advisorBusy)throw Error('Wait for the current context or architecture pass to finish.');
 if(!ad('context-approved').checked)return {};
 if(contextDocuments.length&&!contextFacts.length&&!contextReceipt)throw Error('Read the uploaded context with Meta before including it, or uncheck the approval to analyze without context.');
 const payload=contextPayload();
 if(!payload.projectContext)throw Error('Describe the project or read context files before including context.');
 return payload;
}
function advisorAnalyzed(payload=contextPayload()){analyzedContext=JSON.stringify(payload);projectionSnapshot=null;ad('advisor-projection').innerHTML='';architectureReport=null;advisorSequence++;}
function invalidateAdvisor(){projectionSnapshot=null;ad('advisor-projection').innerHTML='';architectureImage=null;ad('advisor-image-result').innerHTML='';architectureReport=null;advisorSequence++;renderAdvisor();}
function resetAdvisor(){
 contextReadSequence++;advisorSequence++;contextDocuments=[];contextFacts=[];contextReceipt=null;architectureReport=null;analyzedContext=null;advisorBusy=false;
 if(!ad('project-purpose'))return;
 projectionSnapshot=null;ad('advisor-projection').innerHTML='';
 ad('project-purpose').value='';ad('context-approved').checked=false;ad('context-facts').innerHTML='';ad('context-file-list').innerHTML='';ad('context-status').textContent='You can analyze with the promptbase alone. Approve context to include it.';
 ad('context-files').value='';ad('context-folder').value='';ad('read-context').disabled=true;
 renderAdvisor();
}
function contextEdited(){ad('context-approved').checked=false;contextReadSequence++;invalidateAdvisor();ad('context-status').textContent='Context is a draft. Approve it to include it in the next analysis.';}
async function advisorPost(body,path='/api/architecture'){
 if(typeof post==='function')return post(path,body);
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json().catch(()=>({error:'The server returned an invalid response.'}));
 if(!response.ok){const e=Error(result.error||'Request failed.');e.data=result;throw e;}return result;
}
function failedUsage(error){return error.data?.providerAttempted?error.data.usage?.total_tokens!==undefined?` This attempt reported ${error.data.usage.total_tokens.toLocaleString()} tokens.`:' Usage is unknown; do not assume the failed attempt was free.':'';}
async function receiveContext(event){
 if(advisorBusy)return;
 const all=[...event.target.files];
 const eligible=all.filter(f=>/\.(md|txt|json|py|js|ts|yaml|yml|csv)$/i.test(f.name)&&!(f.webkitRelativePath||f.name).split('/').some(x=>x.startsWith('.')));
 if(!eligible.length){ad('context-status').textContent='Choose text, Markdown, JSON, YAML, CSV or source files. No supported files were selected.';event.target.value='';return;}
 if(eligible.length>12||eligible.reduce((s,f)=>s+f.size,0)>40000){ad('context-status').textContent='Choose up to 12 context files, 40 KB total.';event.target.value='';return;}
 const seq=++contextReadSequence;
 try{
  const next=await Promise.all(eligible.map(async f=>({name:f.webkitRelativePath||f.name,content:await f.text()})));
  if(seq!==contextReadSequence)return;
  contextDocuments=next;contextFacts=[];contextReceipt=null;ad('context-approved').checked=false;ad('context-facts').innerHTML='';
  ad('context-file-list').innerHTML=next.map(f=>`<span class="chip">${adEscape(f.name)}</span>`).join('');
  ad('context-status').textContent=`${next.length} context files ready.${all.length>eligible.length?` ${all.length-eligible.length} unsupported or hidden files skipped.`:''} To include them, read them with Meta and approve its interpretation.`;
  ad('read-context').disabled=false;invalidateAdvisor();
 }catch{ad('context-status').textContent='A context file could not be read. Choose the files again.';}
}
function renderFacts(){
 ad('context-facts').innerHTML=contextFacts.map(f=>`<article class="context-fact"><label for="fact-${f.id}">${adEscape(f.kind)}${f.promptFile?' · '+adEscape(f.promptFile):''}</label><textarea id="fact-${f.id}" data-context-fact="${f.id}" maxlength="500" rows="2">${adEscape(f.text)}</textarea><details><summary>Source: ${adEscape(f.source.file)}:${f.source.line}</summary><blockquote>${adEscape(f.source.quote)}</blockquote></details><button class="text-button" data-remove-fact="${f.id}" type="button">Remove this interpretation</button></article>`).join('');
 ad('context-facts').querySelectorAll('[data-context-fact]').forEach(input=>input.addEventListener('input',()=>{contextFacts.find(f=>f.id===input.dataset.contextFact).text=input.value;contextEdited();}));
}
ad('context-facts').addEventListener('click',e=>{const id=e.target.dataset.removeFact;if(!id||advisorBusy)return;contextFacts=contextFacts.filter(f=>f.id!==id);contextEdited();renderFacts();});
function setAdvisorBusy(busy){
 advisorBusy=busy;
 for(const id of ['read-context','context-files','context-folder','clear-context','project-purpose','context-approved','advisor-generate','advisor-model','advisor-budget','fallback-rate','routing-overhead'])ad(id).disabled=busy;
 ad('analyze').disabled=busy||!files.length;
 ad('context-facts').querySelectorAll('textarea,button').forEach(el=>el.disabled=busy);
 if(!busy)ad('read-context').disabled=!contextDocuments.length;
}
ad('context-files').addEventListener('change',receiveContext);ad('context-folder').addEventListener('change',receiveContext);
ad('project-purpose').addEventListener('input',contextEdited);
ad('context-approved').addEventListener('change',()=>{invalidateAdvisor();ad('context-status').textContent=ad('context-approved').checked?'Context approved. Analyze the promptbase to apply it.':'The next analysis will use the promptbase alone.';});
ad('clear-context').addEventListener('click',()=>{resetAdvisor();ad('context-status').textContent='Context cleared. Analyze again if the previous candidate used this context.';});
ad('read-context').addEventListener('click',async()=>{
 const seq=++contextReadSequence;setAdvisorBusy(true);ad('read-context').textContent='Reading context…';ad('context-status').textContent='Meta is identifying the project, workflows and exceptions. Original source quotes will remain visible.';
 try{
  const draft=await advisorPost({contextFiles:contextDocuments,promptFiles:files.map(f=>f.name),budget:Number(ad('advisor-budget').value)},'/api/context');
  if(seq!==contextReadSequence)return;
  contextFacts=draft.facts;contextReceipt=draft.receipt;
  if(!ad('project-purpose').value.trim())ad('project-purpose').value=contextFacts.filter(f=>f.kind==='purpose').map(f=>f.text).join('\n').slice(0,1500);
  ad('context-approved').checked=false;renderFacts();invalidateAdvisor();
  ad('context-status').textContent=`${draft.facts.length} source-linked facts ready for review. ${draft.receipt.model} · ${draft.receipt.usage?.total_tokens?.toLocaleString()??'unknown'} reported tokens. Edit anything unclear, then approve.`;
 }catch(e){if(seq===contextReadSequence)ad('context-status').textContent=e.message+failedUsage(e);}
 finally{if(seq===contextReadSequence){setAdvisorBusy(false);ad('read-context').textContent='Read context with Meta';renderAdvisor();}}
});
function advisorAssumptions(){return {fallbackRate:Number(ad('fallback-rate').value)/100,routingChars:Number(ad('routing-overhead').value)};}
function advisorBody(action){return {action,files,analysis,...contextPayload(),modelChoice:ad('advisor-model').value,budget:Number(ad('advisor-budget').value),assumptions:advisorAssumptions()};}
function percent(value){return `${value>0?'+':''}${value.toFixed(1)}%`;}
function renderProjection(p){
 projectionSnapshot=analysis?.sha256;
 const change=-p.inputSavingsPercent;
 ad('advisor-projection').innerHTML=`<div class="projection-main"><span>Projected instruction input</span><strong class="${change<0?'token-good':change>0?'token-bad':''}">${percent(change)}</strong><span>~${p.baselineInputTokens.toLocaleString()} → ~${p.expectedInputTokens.toLocaleString()} tokens/request</span></div><p>Scenario estimate, not a measured result. Assumes ${(p.fallbackRate*100).toFixed(0)}% broader retries and equal traffic across workflows.</p><details><summary>See the calculation and limits</summary><p>Expected instruction characters = compact context + fallback rate × broader context + routing overhead. Approximate tokens = characters ÷ 4.</p><p>Token range: original ${p.tokenRange.baseline.join('–')}; proposed ${p.tokenRange.candidate.join('–')}. Break-even fallback rate: ${p.breakEvenFallbackRate===null?'unknown':(p.breakEvenFallbackRate*100).toFixed(1)+'%'}.</p><ul>${p.assumptions.map(x=>`<li>${adEscape(x)}</li>`).join('')}</ul><table><thead><tr><th>Broader retries</th><th>Approx. input</th><th>Change</th></tr></thead><tbody>${p.sensitivity.map(r=>`<tr><td>${Math.round(r.fallbackRate*100)}%</td><td>${r.expectedInputTokens.toLocaleString()}</td><td class="${r.inputSavingsPercent>0?'token-good':'token-bad'}">${percent(-r.inputSavingsPercent)}</td></tr>`).join('')}</tbody></table></details>`;
}
function renderAdvisor(){
 if(!ad('advisor-generate'))return;
 if(projectionSnapshot!==analysis?.sha256){ad('advisor-projection').innerHTML='';projectionSnapshot=null;}
 if(architectureReport&&architectureReport.snapshot!==analysis?.sha256){architectureReport=null;advisorSequence++;}
 const incomplete=analysis?.semantic?.calls?.filter(c=>!['completed','cached'].includes(c.status)).length||0;
 const context=contextPayload(),fresh=analyzedContext===JSON.stringify(context);
 const ready=!!analysis&&!!context.projectContext&&ad('context-approved').checked&&fresh&&!advisorBusy;
 ad('advisor-generate').disabled=!ready;ad('advisor-generate').classList.toggle('ready-action',ready);
 ad('advisor-image').disabled=!architectureReport||advisorBusy||!!architectureImage;
 ad('advisor-download').disabled=!architectureReport||advisorBusy;
 ad('candidate-advisor-download').disabled=!architectureReport||advisorBusy;
 if(!architectureReport){architectureImage=null;ad('advisor-image-result').innerHTML='';ad('advisor-result').innerHTML='';ad('architecture-flow').innerHTML='';}
 if(!analysis)ad('advisor-status').textContent='Analyze a promptbase to inspect architecture options.';
 else if(!context.projectContext||!ad('context-approved').checked)ad('advisor-status').textContent='Add and approve project context in Input, then analyze again to request a tailored plan.';
 else if(!fresh)ad('advisor-status').textContent='Context changed. Analyze the promptbase again before requesting a plan.';
 else if(!architectureReport&&!advisorBusy)ad('advisor-status').textContent=incomplete?`${incomplete} source-analysis passes were incomplete. Original text was retained; architecture suggestions remain provisional.`:'Ready for one bounded Meta design pass. This creates suggestions without editing your candidate.';
}
ad('advisor-generate').addEventListener('click',async()=>{
 const seq=++advisorSequence,body=advisorBody('generate');setAdvisorBusy(true);ad('advisor-generate').textContent='Designing the implementation…';ad('advisor-status').textContent='Meta is checking which techniques fit, what already exists, and how to integrate the proposed changes.';
 try{
  const report=await advisorPost(body);if(seq!==advisorSequence)return;
  architectureReport=report;renderProjection(report.projection);ad('architecture-flow').innerHTML=report.flow;
  ad('advisor-result').innerHTML=`<h3>${adEscape(report.summary)}</h3><p class="hint">${adEscape(report.modelSelection.reason)} ${adEscape(report.receipt.model)} · ${report.receipt.usage?.total_tokens?.toLocaleString()??'unknown'} reported tokens. Generated code requires review and has not been executed.</p><div class="technique-list">${report.techniques.map(t=>`<article class="technique"><div><h4>${adEscape(t.title)}</h4><span class="tag">${adEscape(t.status.replaceAll('-',' '))}</span></div><p>${adEscape(t.why)}</p><details><summary>Implementation, risks and tests</summary><p>${adEscape(t.implementation)}</p><p><strong>Risk:</strong> ${adEscape(t.risk)}</p><p><strong>Test:</strong> ${adEscape(t.validation)}</p><p>Source rules: ${t.evidence.map(adEscape).join(', ')}</p></details></article>`).join('')}</div><h4>Generated files</h4>${report.files.map(f=>`<details class="template-preview"><summary>${adEscape(f.path)} · review required</summary><pre>${adEscape(f.content)}</pre></details>`).join('')}<p class="hint">The architecture kit includes these files, a written implementation plan, calculation assumptions, and an editable flow.svg diagram. No recording is generated.</p>`;
  ad('advisor-status').textContent='Design proposal ready. Review the templates, download the kit, and validate in a separate iteration.';
 }catch(e){if(seq===advisorSequence)ad('advisor-status').textContent=e.message+failedUsage(e);}
 finally{if(seq===advisorSequence){setAdvisorBusy(false);ad('advisor-generate').textContent='Propose an implementation';renderAdvisor();}}
});
async function downloadAdvisor(){
 if(!architectureReport)return;const seq=advisorSequence;
 ad('advisor-download').disabled=true;ad('candidate-advisor-download').disabled=true;
 try{
  const response=await fetch('/api/architecture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...advisorBody('download'),report:architectureReport})});
  if(!response.ok)throw Error((await response.json()).error||'Download failed.');
  if(seq!==advisorSequence)return;const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='promptimize-architecture-kit.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){ad('advisor-status').textContent=e.message;}finally{renderAdvisor();}
}
ad('advisor-download').addEventListener('click',downloadAdvisor);ad('candidate-advisor-download').addEventListener('click',downloadAdvisor);
for(const id of ['fallback-rate','routing-overhead','advisor-model'])ad(id).addEventListener('change',()=>{invalidateAdvisor();ad('advisor-projection').innerHTML='Settings changed. Refresh the estimate before generating a new plan.';});
ad('advisor-preview').addEventListener('click',async()=>{
 if(!analysis)return;const seq=advisorSequence;ad('advisor-preview').disabled=true;
 try{const result=await advisorPost(advisorBody('preview'));if(seq!==advisorSequence)return;renderProjection(result.projection);ad('architecture-flow').innerHTML=result.flow;ad('advisor-status').textContent=result.modelSelection.reason+' Estimate refreshed without generating a model response.';}
 catch(e){ad('advisor-status').textContent=e.message;}finally{ad('advisor-preview').disabled=false;}
});
renderAdvisor();

ad('advisor-image').addEventListener('click',async()=>{
 if(!architectureReport||advisorBusy)return;const seq=advisorSequence;setAdvisorBusy(true);ad('advisor-image').disabled=true;ad('advisor-image-result').textContent='Muse Image is drawing the suggested flow…';
 try{const result=await advisorPost({...advisorBody('image'),report:architectureReport},'/api/architecture-image');if(seq!==advisorSequence)return;architectureImage=result;ad('advisor-image-result').innerHTML=`<img src="${adEscape(result.source)}" alt="Muse Image illustration of the proposed context loading flow"><p class="hint">${adEscape(result.note)} No performance result is implied.</p><a class="secondary" href="${adEscape(result.source)}" download="promptimize-architecture.png" target="_blank" rel="noopener">Open / save illustration</a>`;}
 catch(e){if(seq===advisorSequence)ad('advisor-image-result').textContent=e.message+failedUsage(e);}
 finally{if(seq===advisorSequence){setAdvisorBusy(false);renderAdvisor();}}
});
