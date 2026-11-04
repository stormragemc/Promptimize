// Public synthetic sample only. Builds an isolated, zero-provider-call visual QA page.
const {readFileSync,writeFileSync}=require('node:fs'),vm=require('node:vm');
const {digest}=require('../../api/_bundle'),{createPlan,approvePlan}=require('../../api/_evaluation'),{simulateSample}=require('../../api/_simulation');
const fixture=vm.runInNewContext(readFileSync('app.js','utf8').split('let files=')[0]+';({files:SAMPLE})');
const files=JSON.parse(JSON.stringify(fixture.files));
const rules=files.map((f,i)=>({id:'R'+(i+1),file:f.name,line:1,quote:f.content,workflows:[f.name==='refunds.md'?'refund':f.name==='cancellations.md'?'cancellation':f.name==='profile.md'?'profile':'shared']}));
const analysis={rules,modules:Object.fromEntries(['shared','refund','cancellation','profile'].map(name=>[name,rules.filter(r=>r.workflows.includes(name)).map(r=>r.id)])),model:'muse-spark-1.3',usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}};
analysis.sha256=digest(files,analysis);
const plan=approvePlan(createPlan(files,analysis),files,analysis);
const results=plan.cases.filter(c=>c.enabled).map(test=>{
 const row={case:{...test,baseId:test.id,id:test.id+'-r1',repetition:1,name:test.name+' · run 1'},attempts:[]};
 for(const mode of ['baseline','candidate']){
  const usage={prompt_tokens:mode==='baseline'?1000:600,completion_tokens:50,total_tokens:mode==='baseline'?1050:650};
  const toolCalls=test.tool?[{name:'lookup_event_status',arguments:{event_id:'EV-7'},result:'organizer_cancelled',executed:true}]:[];
  row[mode]={status:'completed',pass:true,mode,snapshot:analysis.sha256,planHash:plan.sha256,caseId:test.id,latencyMs:mode==='baseline'?1100:800,usage,answer:{action:test.expected,entities:{}},toolCalls,loadedModules:mode==='baseline'?Object.keys(analysis.modules):['shared',test.intent],simulation:simulateSample(test,{action:test.expected},toolCalls,true),measurement:{calls:[{mode,stage:'classification',model:'muse-spark-1.3',status:'completed',usage,usageKnown:true}],reservedTokens:1800}};
 }
 return row;
});
const session={analysis,approved:true,reviewSaved:true,results,evaluationPlan:plan,bundleReady:{snapshot:analysis.sha256,fileCount:12,checks:[{pass:true,label:'Synthetic fixture structure'}],commands:{dryRun:'python run.py --dry-run'}},evaluationHistory:[],analysisAttempts:[],iterationHistory:[]};
const bootstrap=`Object.defineProperty(window,'sessionStorage',{value:{getItem:()=>${JSON.stringify(JSON.stringify(session))},setItem:()=>{},removeItem:()=>{}}});window.fetch=async(path)=>{await new Promise(r=>setTimeout(r,2200));if(path==='/api/analyze')return {ok:true,json:async()=>(${JSON.stringify(analysis)})};throw Error('Synthetic UI fixture: network calls blocked.');};`;
const source=readFileSync('index.html','utf8').replace('<head>','<head><base href="'+"' + location.origin + '"+'">').replace('<body>','<body><div style="position:fixed;bottom:0;left:0;right:0;z-index:999;font:12px system-ui;background:#241a39;color:white;padding:6px;text-align:center">Synthetic UI fixture · invented measurements for layout testing · no provider calls</div>').replace('<script src="/app.js"',`<script>${bootstrap}</script><script src="/app.js"`);
// srcdoc has an opaque origin: preferences/session data cannot overwrite the real app.
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Promptimize synthetic UI fixture</title></head><body style="margin:0"><iframe title="Isolated Promptimize UI fixture" sandbox="allow-scripts allow-downloads" style="width:100%;height:100dvh;border:0"></iframe><script>document.querySelector('iframe').srcdoc=${JSON.stringify(source).replace(/<\//g,'<\\/').replace("' + location.origin + '","\" + location.origin + \"")};</script></body></html>`;
writeFileSync('tests/browser/experience-fixture.html',html);
