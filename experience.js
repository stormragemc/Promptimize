/* Purposeful motion and guidance. No model calls, approvals or prompt edits here. */
(()=>{
 'use strict';
 const E=PromptimizeExperience,q=selector=>document.querySelector(selector);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const storage={get(key){try{return localStorage.getItem(key);}catch{return null;}},set(key,value){try{localStorage.setItem(key,value);}catch{}}};
 const plane='<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 14 28 4l-8 24-5-10-11-4Z" fill="currentColor" fill-opacity=".13" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m15 18 13-14M15 18l-1 8 5-4" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
 const activity=q('#activity'),flight=q('#activity-flight'),tour=q('#guide-dialog'),hint=q('#next-hint');
 let operations=[],activityDelay=null,activityClock=null,activityStart=0;
 let tourIndex=0,tourTarget=null,tourOrigin=null,tourPanel=null,tourSeen=storage.get('promptimize-guide-v1')==='seen';
 let lastInteraction=Date.now(),hintTarget=null,hintKey='',dismissedHint='',hintsEnabled=storage.get('promptimize-hints')!=='off';
 let frame=null,countFrame=null,countKey='',countVisible=false;
 q('#help-guide').innerHTML=plane+'<span class="sr-only">Open the Promptimize guide</span>';
 q('#guide-hints').checked=hintsEnabled;
 const specs={
  '/api/context':{panel:'input',button:'read-context',title:'Reading project context',detail:'Meta is connecting the documentation to reviewable source facts.',tip:'Review the quoted evidence before approving the context.'},
  '/api/architecture':{panel:'proposal',button:'advisor-generate',title:'Preparing the architecture proposal',detail:'Checking techniques, templates and projected input use.',tip:'Forecasts remain separate from measured results.'},
  '/api/architecture-image':{panel:()=>q('#input.active')?'input':'proposal',button:()=>q('#input.active')?'input-advisor-image':'advisor-image',title:'Drawing the architecture illustration',detail:'Muse Image is creating one optional illustration.',tip:'The exact SVG remains available without an image call.'},
  '/api/analyze':{panel:'input',button:'analyze',title:'Untangling your promptbase',detail:'Meta is reading the selected files and extracting source-linked rules.',tip:'You can check each rule against its original wording in the audit.'},
  '/api/review':{panel:()=>q('#proposal.active')?'proposal':'review',button:()=>q('#proposal.active')?'save-tree':'save-review',title:'Saving your reviewed proposal',detail:'Checking paths, source links and candidate assignments.',tip:'Your original files stay unchanged.'},
  '/api/package-check':{panel:'candidate',button:'prepare-bundle',title:'Preparing the runnable bundle',detail:'Checking the module files, source map and runner.',tip:'This checks the artifact structure without generating model responses.'},
  '/api/evaluation-plan':{panel:'tests',button:body=>body.action==='approve'?'approve-test-plan':'build-test-plan',title:'Preparing the test plan',detail:'Checking the selected cases and their source-rule links.',tip:'No test answers are generated here.'},
  '/api/evaluation-preflight':{panel:'tests',button:'preflight',title:'Sizing your comparisons',detail:'Counting the approved contexts and reserving bounded output allowances.',tip:'Sizing generates no test answers. The count is not exact billing.'},
  '/api/evaluation-case':{panel:'tests',button:'run-tests',title:'Comparing both promptbases',detail:body=>`${body.mode==='baseline'?'Old':'Candidate'} version · ${body.caseId} · run ${body.repetition}`,tip:'Watch the recorded decisions and simulated tools in the visual comparison.'}
 };
 const resolve=(value,body)=>typeof value==='function'?value(body):value;
 function currentOperation(){return operations.at(-1);}
 function paintActivity(){
  if(!operations.length)return;
  const op=currentOperation(),panel=q('#'+op.panel);
  if(!panel)return;
  if(activity.parentElement!==panel)panel.insertBefore(activity,panel.querySelector('.panel-head')?.nextElementSibling||panel.firstChild);
  q('#activity-title').textContent=op.title;q('#activity-detail').textContent=op.detail;q('#activity-tip').textContent=op.tip;
  q('#activity-context').textContent=comparisonsRunning&&evaluationPlan?`${results.reduce((n,r)=>n+Number(isComplete(r.baseline))+Number(isComplete(r.candidate)),0)} / ${getCases().length*2} version runs completed`:'';
  q('#activity-time').textContent=Math.floor((Date.now()-activityStart)/1000)+'s elapsed';
  activity.hidden=false;
  const rect=activity.getBoundingClientRect();flight.classList.toggle('motion-paused',document.hidden||rect.bottom<0||rect.top>innerHeight);
 }
 async function withActivity(spec,task){
  const op={...spec,token:{}};operations.push(op);
  const button=q('#'+op.button);if(button)button.setAttribute('aria-busy','true');
  hideHint();
  if(operations.length===1){activityStart=Date.now();activityDelay=setTimeout(paintActivity,160);activityClock=setInterval(()=>{if(!document.hidden&&Date.now()-activityStart>=160)paintActivity();},1000);}
  else if(!activity.hidden)paintActivity();
  try{return await task();}
  finally{
   operations=operations.filter(item=>item.token!==op.token);
   if(button&&!operations.some(item=>item.button===op.button))button.removeAttribute('aria-busy');
   if(!operations.length){clearTimeout(activityDelay);clearInterval(activityClock);activity.hidden=true;lastInteraction=Date.now();}
   else if(!activity.hidden)paintActivity();
  }
 }
 const basePost=post;
 post=async function(path,body){
  const spec=specs[path];if(!spec)return basePost(path,body);
  return withActivity(Object.fromEntries(Object.entries(spec).map(([key,value])=>[key,resolve(value,body)])),()=>basePost(path,body));
 };
 // The suite and file transfer have work outside post(), so keep their feedback alive too.
 for(const id of ['run-tests','export-zip']){
  const button=q('#'+id),original=button.onclick;
  button.onclick=()=>withActivity(id==='run-tests'
   ?{panel:'tests',button:id,title:'Comparing both promptbases',detail:'Running the same approved cases on the old and candidate versions.',tip:'Open visual comparison while the runs finish. Playback uses no extra tokens.'}
   :{panel:q('#finish.active')?'finish':'candidate',button:q('#finish.active')?'finish-zip':id,title:'Packing your workflow folders',detail:'Preparing the ZIP and its test evidence.',tip:'This download uses no model calls.'},()=>original());
 }
 for(const id of ['folder','file-select']){
  const input=q('#'+id),original=input.onchange;
  input.onchange=event=>withActivity({panel:'input',button:'analyze',title:'Reading your files',detail:'Opening the selected text files locally.',tip:'Analysis starts only after you click Analyze bundle.'},()=>original(event));
 }
 function finishMarkup(report){
  return E.finishStats(report).map(stat=>`<div class="finish-stat"><strong class="${stat.tone?'token-'+stat.tone:''}" aria-label="${escape(E.formatStat(stat))}"><span aria-hidden="true" data-counter="${stat.id}" data-from="${stat.from??''}" data-to="${stat.to??''}" data-digits="${stat.digits}" data-prefix="${stat.prefix||''}" data-suffix="${stat.suffix||''}">${escape(E.formatStat(stat))}</span></strong><span>${escape(stat.label)}</span><small>${escape(stat.caption)}</small></div>`).join('');
 }
 function endCounters(){
  cancelAnimationFrame(countFrame);countFrame=null;
  q('#finish-metrics').querySelectorAll('[data-counter]').forEach(el=>{if(el.dataset.to!=='')el.textContent=E.formatStat({digits:Number(el.dataset.digits),prefix:el.dataset.prefix,suffix:el.dataset.suffix,to:Number(el.dataset.to)});});
 }
 function startCounters(){
  if(reduced.matches||document.hidden){endCounters();return;}
  const elements=[...q('#finish-metrics').querySelectorAll('[data-counter]')].filter(el=>el.dataset.to!=='');
  const start=performance.now();
  function tick(now){
   const t=Math.min(1,(now-start)/1000),ease=1-Math.pow(1-t,4);
   for(const el of elements){const from=el.dataset.from===''?Number(el.dataset.to):Number(el.dataset.from),to=Number(el.dataset.to);el.textContent=E.formatStat({digits:Number(el.dataset.digits),prefix:el.dataset.prefix,suffix:el.dataset.suffix},from+(to-from)*ease);}
   if(t<1)countFrame=requestAnimationFrame(tick);else endCounters();
  }
  cancelAnimationFrame(countFrame);countFrame=requestAnimationFrame(tick);
 }
 const baseRenderFinish=renderFinish;
 renderFinish=function(){
  baseRenderFinish();if(!evaluationFinished())return;
  const report=PromptimizeMetrics.summarize(analysis,evaluationPlan,results);
  const key=JSON.stringify([analysis.sha256,evaluationPlan.sha256,report.baseline,report.candidate]);
  if(q('#finish-metrics').dataset.receipt===key)return;
  endCounters();q('#finish-metrics').innerHTML=finishMarkup(report);q('#finish-metrics').dataset.receipt=key;countKey='';
  maybeCount();
 };
 function maybeCount(){
  const el=q('#finish-metrics'),key=el.dataset.receipt;
  if(!key||!countVisible||!q('#finish.active')||countKey===key)return;
  countKey=key;startCounters();
 }
 if(typeof IntersectionObserver==='function')new IntersectionObserver(entries=>{countVisible=entries[0].isIntersecting;if(countVisible)maybeCount();else endCounters();},{threshold:.25}).observe(q('#finish-metrics'));
 else countVisible=true;
 const baseShow=show;
 show=function(step){baseShow(step);if(q('#'+step)?.classList.contains('active')){hideHint();lastInteraction=Date.now();if(step==='finish')maybeCount();}};
 const baseSetFiles=setFiles;
 setFiles=function(...args){endCounters();countKey='';q('#finish-metrics').innerHTML='';delete q('#finish-metrics').dataset.receipt;dismissedHint='';baseSetFiles(...args);};

 function activePanel(){return q('.panel.active')?.id||'input';}
 function availablePanel(panel){return panel==='input'||!!analysis&&(['audit','proposal','review'].includes(panel)||approved&&(panel!=='tests'||bundleReady?.snapshot===analysis.sha256)&&(panel!=='finish'||evaluationFinished()));}
 function clearTourTarget(){tourTarget=null;q('#guide-spotlight').hidden=true;}
 function placeTour(){
  if(!tour.open)return;
  const vw=innerWidth,vh=innerHeight,card=tour.getBoundingClientRect(),padding=16;
  const r=tourTarget?.getBoundingClientRect(),spot=q('#guide-spotlight');
  let left=(vw-card.width)/2,top=Math.max(padding,(vh-card.height)/2);
  if(r&&r.bottom>0&&r.top<vh){
   const x=Math.max(8,r.left-7),y=Math.max(8,r.top-7),width=Math.max(0,Math.min(vw-8,r.right+7)-x),height=Math.max(0,Math.min(vh-8,r.bottom+7)-y);
   Object.assign(spot.style,{left:x+'px',top:y+'px',width:width+'px',height:height+'px'});spot.hidden=false;
   if(r.right+card.width+28<vw){left=r.right+20;top=Math.max(padding,r.top);}
   else if(r.left-card.width-20>padding){left=r.left-card.width-20;top=Math.max(padding,r.top);}
   else if(r.bottom+card.height+28<vh){left=Math.min(vw-card.width-padding,Math.max(padding,r.left));top=r.bottom+20;}
   else if(r.top-card.height-20>padding){left=Math.min(vw-card.width-padding,Math.max(padding,r.left));top=r.top-card.height-20;}
   else top=vh-card.height-padding;
  }else spot.hidden=true;
  Object.assign(tour.style,{left:Math.max(padding,Math.min(vw-card.width-padding,left))+'px',top:Math.max(padding,Math.min(vh-card.height-padding,top))+'px'});
 }
 function renderTour(){
  clearTourTarget();const step=E.tour[tourIndex],available=availablePanel(step.panel);
  if(available){baseShow(step.panel);if(activePanel()!==step.panel)q('#guide-availability').textContent='Save the current edits before opening this step.';}
  const real=available&&activePanel()===step.panel?q('#'+step.target):null;
  tourTarget=real||q(`.step[data-step="${step.panel}"]`);
  q('#guide-title').textContent=step.title;q('#guide-body').textContent=step.body;q('#guide-note').textContent=step.note;
  q('#guide-progress').textContent=`${tourIndex+1} of ${E.tour.length}`;
  q('#guide-demo').innerHTML=step.clicks.map((label,index)=>`<span class="guide-demo-control" style="--order:${index}">${escape(label)}${index===0?'<svg class="guide-pointer" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 3 13 10-7 1-3 7-3-18Z" fill="var(--paper)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>':''}</span>`).join('<span class="guide-demo-arrow" aria-hidden="true">→</span>');
  q('#guide-availability').textContent=real?'Highlighted in your workbench':available?'Save your current edits to open this step.':'Preview of a later step. Finish the earlier steps to unlock it.';
  q('#guide-back').disabled=tourIndex===0;q('#guide-next').textContent=tourIndex===E.tour.length-1?'Let’s begin':'Next';
  q('#guide-take-me').hidden=!real||step.target==='workbench';
  q('#guide-take-me').disabled=!real;
  // Keep the highlighted control above the card on narrow/short screens.
  tourTarget?.scrollIntoView({behavior:'auto',block:'start',inline:'nearest'});
  requestAnimationFrame(placeTour);q('#guide-title').focus({preventScroll:true});
 }
 function openTour(){
  if(tour.open||q('#budget-warning-dialog').open||q('#simulation-dialog').open)return;
  tourOrigin=document.activeElement;tourPanel=activePanel();tourIndex=0;hideHint();
  // Record both dismissal and completion; replay is always available in the header.
  tourSeen=true;storage.set('promptimize-guide-v1','seen');tour.showModal();renderTour();
 }
 function closeTour(takeMe=false){
  const step=E.tour[tourIndex],target=takeMe&&availablePanel(step.panel)?q('#'+step.target):null;
  tour.close();clearTourTarget();
  if(takeMe&&target){baseShow(step.panel);if(activePanel()===step.panel){target.scrollIntoView({behavior:reduced.matches?'auto':'smooth',block:'center'});if(!target.disabled){target.focus({preventScroll:true});target.classList.add('guide-arrival');setTimeout(()=>target.classList.remove('guide-arrival'),1800);}}}
  else{if(tourPanel&&availablePanel(tourPanel))baseShow(tourPanel);(tourOrigin?.isConnected?tourOrigin:q('#help-guide')).focus({preventScroll:true});}
  lastInteraction=Date.now();
 }
 q('#help-guide').onclick=openTour;q('#guide-close').onclick=()=>closeTour();q('#guide-skip').onclick=()=>closeTour();
 q('#guide-next').onclick=()=>{if(tourIndex<E.tour.length-1){tourIndex++;renderTour();}else closeTour();};
 q('#guide-back').onclick=()=>{if(tourIndex>0){tourIndex--;renderTour();}};
 q('#guide-take-me').onclick=()=>closeTour(true);
 tour.addEventListener('cancel',event=>{event.preventDefault();closeTour();});
 q('#guide-hints').onchange=event=>{hintsEnabled=event.target.checked;storage.set('promptimize-hints',hintsEnabled?'on':'off');if(!hintsEnabled)hideHint();lastInteraction=Date.now();};

 function guidanceState(){return {panel:activePanel(),files:files.length,proposalDirty,reviewSaved,reviewDirty,approved,bundleReady:bundleReady?.snapshot===analysis?.sha256,supported:!!analysis&&supported(),plan:!!evaluationPlan,planApproved:!!evaluationPlan?.approved,preflight:!!preflight,canRun:!!preflight?.canRun,budgetBlocked:budgetWarningBlocked,finished:evaluationFinished(),hasResults:results.length>0,busy:operations.length>0,running:comparisonsRunning,dialog:!!q('dialog[open]'),dirtyInput:!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')};}
 function hideHint(){if(hintTarget)hintTarget.classList.remove('next-action');hintTarget=null;hint.hidden=true;}
 function placeHint(){
  if(!hintTarget||hint.hidden)return;
  const r=hintTarget.getBoundingClientRect(),onScreen=r.top>=10&&r.bottom<=innerHeight-10&&r.right>0&&r.left<innerWidth;
  const box=hint.getBoundingClientRect();
  hint.classList.toggle('hint-offscreen',!onScreen);hint.classList.toggle('hint-above',onScreen&&r.top>box.height+32);
  q('#hint-show').hidden=onScreen;q('#hint-pointer').style.transform=!onScreen&&r.bottom<0?'rotate(180deg)':'';
  if(onScreen){
   const above=r.top>box.height+32;
   Object.assign(hint.style,{left:Math.max(12,Math.min(innerWidth-box.width-12,r.left+r.width/2-box.width/2))+'px',top:Math.max(12,above?r.top-box.height-18:Math.min(innerHeight-box.height-12,r.bottom+18))+'px'});
   hintTarget.classList.add('next-action');
  }else{
   hintTarget.classList.remove('next-action');Object.assign(hint.style,{left:Math.max(12,(innerWidth-box.width)/2)+'px',top:Math.max(12,innerHeight-box.height-18)+'px'});
  }
 }
 function maybeHint(){
  if(document.hidden||!hintsEnabled||tour.open){hideHint();return;}
  const next=E.nextAction(guidanceState()),key=next?[analysis?.sha256||'new',evaluationPlan?.sha256||'draft',next.id,next.text].join(':'):'';
  if(!next||Date.now()-lastInteraction<18000){hideHint();return;}
  const target=q('#'+next.id);
  if(!target||target.disabled||target.hidden||!target.getClientRects().length||key===dismissedHint){hideHint();return;}
  if(hintKey!==key||hintTarget!==target){hideHint();hintKey=key;hintTarget=target;q('#hint-text').textContent=next.text;hint.hidden=false;}
  placeHint();
 }
 q('#hint-dismiss').onclick=()=>{dismissedHint=hintKey;hideHint();};
 q('#hint-show').onclick=()=>{hintTarget?.scrollIntoView({behavior:reduced.matches?'auto':'smooth',block:'center'});};
 // Scroll alone leaves an active arrow in place so it can track its button.
 document.addEventListener('pointerdown',event=>{if(!event.target.closest('#next-hint')){lastInteraction=Date.now();hideHint();}},{passive:true});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hideHint();lastInteraction=Date.now();},{passive:true});
 document.addEventListener('input',()=>{lastInteraction=Date.now();hideHint();},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){hideHint();endCounters();}else lastInteraction=Date.now();if(!activity.hidden)paintActivity();});
 function onViewport(){
  if(frame)return;frame=requestAnimationFrame(()=>{frame=null;if(tour.open)placeTour();if(!hint.hidden)placeHint();if(!activity.hidden)paintActivity();});
 }
 window.addEventListener('scroll',()=>{
  onViewport();
  if(!tourSeen&&window.scrollY>70&&!operations.length&&!q('dialog[open]'))openTour();
 },{passive:true});
 window.addEventListener('resize',onViewport,{passive:true});
 reduced.addEventListener('change',()=>{if(reduced.matches)endCounters();});
 setInterval(maybeHint,1000);
 if(analysis&&evaluationPlan)renderFinish();
})();
