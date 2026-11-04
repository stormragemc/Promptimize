(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PromptimizeExperience=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 // Guidance only. These functions never approve work, call a model or change a draft.
 function nextAction(s){
  if(s.busy||s.running||s.dialog||s.dirtyInput)return null;
  const action=(id,text)=>({id,text});
  switch(s.panel){
   case 'input':return s.files?action('analyze','Analyze your selected files'):action('sample','Try the sample, or choose your own files');
   case 'audit':return action('approve','Check the source rules, then view the proposal');
   case 'proposal':return s.proposalDirty?action('save-tree','Save your folder names'):action('to-review','Continue to review the instructions');
   case 'review':return s.approved?null:s.reviewSaved&&!s.reviewDirty?action('freeze','When your review is complete, freeze this candidate'):action('save-review','Review the instructions, then save your corrections');
   case 'candidate':return !s.bundleReady?action('prepare-bundle','Check the runnable bundle'):s.supported?action('go-tests','Compare old and new behavior'):action('export-zip','Download the bundle for your own reviewed tests');
   case 'tests':
    if(!s.supported)return null;
    if(!s.plan)return action('build-test-plan','Build a test plan from the original rules');
    if(!s.planApproved)return action('approve-test-plan','Review the cases and expectations, then approve');
    if(!s.preflight)return action('preflight','Size the approved tests before generating answers');
    if(!s.canRun||s.budgetBlocked)return action('edit-test-plan','Edit the test plan to resolve the budget or context warning');
    if(s.finished)return null;
    return action('run-tests',s.hasResults?'Resume unfinished calls only when ready. This uses tokens.':'Run both versions when ready. This uses tokens.');
   case 'finish':return action('finish-zip','Download your workflow folders and test evidence');
   default:return null;
  }
 }
 const tour=[
  {title:'Welcome to Promptimize.ai!',panel:'input',target:'workbench',body:'Turn a tangled promptbase into workflow folders that load less context. Review the rules, freeze a candidate, then compare both versions before adopting it.',clicks:['Bring files','Review the refactor','Test both versions','Download'],note:'This tour only explains the controls. It never starts a model call or approves your work.'},
  {title:'Start with a promptbase',panel:'input',target:'sample',body:'Choose a folder or specific files. For a quick demo, select Load the sample. You can also type project context or upload its documentation, review the extracted facts and approve the context before Analyze bundle.',clicks:['Load the sample','Analyze bundle'],note:'Analyze sends your selected files to Meta. Nothing runs just by taking this tour.'},
  {title:'Check what the source says',panel:'audit',target:'approve',body:'Read each extracted rule. Open its source link to check the exact wording and exceptions. When it looks right, click View proposal.',clicks:['View source','View proposal'],note:'Interpretations need human review. Your original files stay unchanged.'},
  {title:'Arrange the real folders',panel:'proposal',target:'save-tree',body:'Compare Before and Proposed. Edit a proposed folder name, then Save folder names. Continue with Review instructions. These paths become real folders in the download.',clicks:['Edit folder name','Save folder names','Review instructions'],note:'If you keep the proposed names, continue directly to review.'},
  {title:'Explore a loading strategy',panel:'proposal',target:'advisor-generate',body:'With reviewed project context, request an implementation proposal. Inspect its assumptions, risks and source links, then download the architecture kit. Image generation is optional.',clicks:['Preview savings scenario','Propose an implementation','Download architecture kit'],note:'Templates require review. A prediction is not proof of improved cost or behavior.'},
  {title:'Correct, save, then freeze',panel:'review',target:'save-review',body:'Open a rule to correct its candidate wording or workflow assignment. Save corrections, then Approve & freeze candidate. Freezing fixes the exact version the tests will check.',clicks:['Open a rule','Save corrections','Approve & freeze candidate'],note:'Test failures become notes for the next proposal. They never silently patch this frozen draft.'},
  {title:'Prepare the runnable version',panel:'candidate',target:'prepare-bundle',body:'Click Prepare runnable bundle to check the folder structure and runner. Once ready, select Compare behavior. You can also download the bundle here.',clicks:['Prepare runnable bundle','Compare behavior'],note:'This structural check generates no model responses. Built-in comparisons support the sample and JD-viewer adapter.'},
  {title:'Approve the test plan',panel:'tests',target:'build-test-plan',body:'Build test plan, then inspect the requests, expected outcomes and source-rule links. Select cases, repetitions and a token allowance. Click Approve selected cases when ready.',clicks:['Build test plan','Review cases & allowance','Approve selected cases'],note:'A small set of reviewed cases gives evidence for those cases, not a guarantee of every possible behavior.'},
  {title:'Size first. Then compare.',panel:'tests',target:'preflight',body:'Click Check token budget before Run comparisons. If the allowance is too small, edit cases or reserve more tokens, then approve and size again. Open visual comparison to watch the recorded actions and final states.',clicks:['Check token budget','Run comparisons','Open visual comparison'],note:'Sizing generates no test answers. Comparisons make paid model calls only after you click Run. Trace playback uses no model calls.'},
  {title:'Take the evidence with you',panel:'finish',target:'finish-zip',body:'After all paired runs finish, Here you go shows measured changes and the downloads. Take workflow folders, one Markdown file, a candidate registry or the test report. Upload another promptbase starts fresh.',clicks:['Inspect measured changes','Download folder ZIP','Upload another promptbase'],note:'Failed checks or unverified costs stay visible. Open this guide again with the little paper plane in the top-right corner.'}
 ];
 function finishStats(report){
  const a=report.baseline,b=report.candidate,n=report.expectedPairs;
  const known=a.unknownUsageCalls===0&&b.unknownUsageCalls===0;
  const delta=a.totalTokens-b.totalTokens,change=a.totalTokens?((b.totalTokens/a.totalTokens-1)*100):null;
  const pct=v=>n?v/n*100:0;
  const changeText=change===null?'No baseline token total':`${change>0?'+':''}${change.toFixed(1)}% vs old tasks`;
  return [
   {id:'tokens',from:0,to:Math.abs(delta),digits:0,label:known?(delta>=0?'Fewer task tokens':'More task tokens'):'Reported token difference',caption:known?changeText:'Partial receipts; savings unverified',tone:known&&delta!==0?(delta>0?'good':'bad'):''},
   {id:'checks',from:pct(a.passed),to:pct(b.passed),digits:0,suffix:'%',label:'Reviewed cases passed',caption:`${b.passed}/${n} candidate · ${a.passed}/${n} old`,tone:b.passed===n?'good':b.passed<a.passed?'bad':''},
   {id:'latency',from:a.p50LatencyMs===null?null:a.p50LatencyMs/1000,to:b.p50LatencyMs===null?null:b.p50LatencyMs/1000,digits:2,suffix:'s',label:'Median response time',caption:a.p50LatencyMs===null?'Old time unavailable':`Old ${(a.p50LatencyMs/1000).toFixed(2)}s · small sample`,tone:a.p50LatencyMs!==null&&b.p50LatencyMs!==null?(b.p50LatencyMs<a.p50LatencyMs?'good':b.p50LatencyMs>a.p50LatencyMs?'bad':''):''},
   {id:'cost',from:a.costUSD,to:b.costUSD,digits:5,prefix:'$',label:'Estimated task cost',caption:a.costUSD===null?'Old cost unverified':`Old $${a.costUSD.toFixed(5)} · excludes optimizer`,tone:a.costUSD!==null&&b.costUSD!==null?(b.costUSD<a.costUSD?'good':b.costUSD>a.costUSD?'bad':''):''}
  ];
 }
 function formatStat(stat,value=stat.to){return value===null?'Unverified':(stat.prefix||'')+Number(value).toLocaleString('en-US',{minimumFractionDigits:stat.digits,maximumFractionDigits:stat.digits})+(stat.suffix||'');}
 return {nextAction,tour,finishStats,formatStat};
});
