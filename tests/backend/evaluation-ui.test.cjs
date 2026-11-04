// Functional DOM double, not screenshot/browser QA. Provider calls are mocked.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs');const {join}=require('node:path');
const {digest}=require('../../api/_bundle');
const routes={'/api/evaluation-plan':require('../../api/evaluation-plan'),'/api/evaluation-preflight':require('../../api/evaluation-preflight'),'/api/evaluation-case':require('../../api/evaluation-case')};
const root=join(__dirname,'../..');
function dom(){
 const nodes=new Map(),dynamic=new Map();
 const decode=text=>text.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 class Element{
  constructor(id){this.id=id;this.disabled=false;this.dataset={};this.value='';this.checked=false;this.open=false;this._html='';const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,v)=>{if(v===undefined)v=!classes.has(c);v?classes.add(c):classes.delete(c);return v;}};}
  set innerHTML(html){this._html=html;for(const m of html.matchAll(/\bid="([^"]+)"/g))if(!nodes.has(m[1]))nodes.set(m[1],new Element(m[1]));
   for(const m of html.matchAll(/<textarea[^>]*data-edit-case="(\d+)"[^>]*>([\s\S]*?)<\/textarea>/g)){const el=new Element('case-editor');el.value=decode(m[2]);dynamic.set('[data-edit-case="'+m[1]+'"]',el);}
   for(const m of html.matchAll(/<input[^>]*data-include-case="(\d+)"[^>]*>/g)){const el=new Element('include');el.checked=/\bchecked\b/.test(m[0]);dynamic.set('[data-include-case="'+m[1]+'"]',el);}
  }
  get innerHTML(){return this._html;}
  addEventListener(){} scrollIntoView(){} showModal(){this.open=true;}close(){this.open=false;}click(){return this.onclick?.();}insertAdjacentHTML(_,html){this.innerHTML+=html;}
 }
 const html=readFileSync(join(root,'index.html'),'utf8');
 for(const m of html.matchAll(/\bid="([^"]+)"/g)){assert(!nodes.has(m[1]),'Duplicate static id '+m[1]);nodes.set(m[1],new Element(m[1]));}
 const steps=['input','audit','proposal','review','candidate','tests'].map(step=>{const el=new Element('step-'+step);el.dataset.step=step;return el;});
 nodes.set('.steps',new Element('steps'));
 const document={querySelector(selector){if(dynamic.has(selector))return dynamic.get(selector);if(selector==='.steps')return nodes.get(selector);if(selector.startsWith('#')){const id=selector.slice(1).split(' ')[0];if(!nodes.has(id))throw Error('Missing DOM ID '+id);if(selector.includes(' ')){if(!dynamic.has(selector))dynamic.set(selector,new Element(selector));return dynamic.get(selector);}return nodes.get(id);}throw Error('Unsupported DOM selector '+selector);},
  querySelectorAll(selector){if(selector==='.step')return steps;if(selector==='.panel')return ['input','audit','proposal','review','candidate','tests'].map(id=>nodes.get(id));return [];},createElement:()=>new Element('created')};
 return {document,nodes};
}
test('review → repeated comparisons → receipts → replay keeps the candidate frozen',async t=>{
 const {document,nodes}=dom(),source=readFileSync(join(root,'app.js'),'utf8');
 const fixture=vm.runInNewContext(source.split('let files=')[0]+';({files:SAMPLE,cases:CASES})');
 const rules=fixture.files.map((f,i)=>({id:'R'+(i+1),file:f.name,line:1,quote:f.content,workflows:[f.name==='refunds.md'?'refund':f.name==='cancellations.md'?'cancellation':f.name==='profile.md'?'profile':'shared']}));
 const a={rules,modules:Object.fromEntries(['shared','refund','cancellation','profile'].map(name=>[name,rules.filter(r=>r.workflows.includes(name)).map(r=>r.id)])),model:'muse-spark-1.3',usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}};a.sha256=digest(fixture.files,a);
 let generations=0;
 const original=process.env.META_API_KEY;process.env.META_API_KEY='ui-test-double';t.after(()=>{if(original===undefined)delete process.env.META_API_KEY;else process.env.META_API_KEY=original;});
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('/input_tokens'))return {ok:true,json:async()=>({input_tokens:Math.ceil(JSON.stringify(body.input).length/4)})};
  const q=body.messages[1].content,scenario=fixture.cases.find(c=>c.query===q);assert(scenario,'Unknown fixture request');generations++;
  const followup=body.messages.length>2;const answer=scenario.tool&&!followup?{action:'lookup_event_status',event_id:'EV-7'}:{action:scenario.expected};
  const input=Math.ceil(JSON.stringify(body.messages).length/4);
  return {ok:true,json:async()=>({model:'muse-spark-1.3',choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:input,completion_tokens:15,total_tokens:input+15}})};
 });
 const browserFetch=async(path,options)=>{
  assert(routes[path],'Unexpected browser request '+path);
  const res={status(code){this.code=code;return this;},setHeader(){return this;},json(data){this.data=data;return this;}};
  await routes[path]({method:'POST',body:JSON.parse(options.body)},res);
  return {ok:res.code===200,status:res.code,json:async()=>res.data};
 };
 const context=vm.createContext({document,fetch:browserFetch,structuredClone,console,Blob,URL,Map,Set,Date,setTimeout,clearTimeout,setInterval,clearInterval,navigator:{clipboard:{writeText:async()=>{}}},sessionStorage:{getItem:()=>null,setItem:()=>{}}});
 for(const file of ['app.js','evaluation-metrics.js','evaluation-ui.js'])vm.runInContext(readFileSync(join(root,file),'utf8'),context,{filename:file});
 context.fixture=fixture;context.a=a;
 vm.runInContext('files=fixture.files;sampleLoaded=true;analysis=a;approved=true;reviewSaved=true;bundleReady=null;renderAnalysis();',context);
 assert.equal(nodes.get('preflight').disabled,true);assert.equal(nodes.get('build-test-plan').disabled,true);
 vm.runInContext('bundleReady={snapshot:a.sha256,fileCount:12,checks:[],commands:{dryRun:"python run.py --dry-run"}};renderBundle();',context);
 assert.equal(nodes.get('build-test-plan').disabled,false);
 await nodes.get('build-test-plan').click();assert.equal(generations,0);
 nodes.get('evaluation-repetitions').value='2';nodes.get('evaluation-allowance').value='100000';
 await nodes.get('approve-test-plan').click();assert.equal(nodes.get('preflight').disabled,false);
 await nodes.get('preflight').click();assert.equal(nodes.get('run-tests').disabled,false);
 await nodes.get('run-tests').click();
 assert.equal(generations,28);assert.equal(vm.runInContext('results.length',context),12);
 assert.equal(vm.runInContext('results.every(row=>row.baseline.pass&&row.candidate.pass)',context),true);
 assert.equal(vm.runInContext('analysis.sha256',context),a.sha256);
 assert(nodes.get('results').innerHTML.includes('One-time optimizer'));
 assert(nodes.get('results').innerHTML.includes('Selected checks pass'));
 vm.runInContext('openSimulation(getCases()[0].id)',context);assert.equal(nodes.get('simulation-dialog').open,true);
 nodes.get('sim-prev').click();nodes.get('close-simulation').click();assert.equal(generations,28);
 nodes.get('edit-test-plan').click();assert.equal(vm.runInContext('evaluationHistory.length',context),1);assert.equal(vm.runInContext('results.length',context),0);assert.equal(nodes.get('preflight').disabled,true);
 vm.runInContext('results=structuredClone(evaluationHistory[0].results);results[0].candidate.pass=false;results[0].candidate.failureReason="Fixture regression";',context);
 nodes.get('new-proposal').click();assert(nodes.get('review-notes').value.includes('Carry forward for investigation'));
 assert.equal(vm.runInContext('analysis.sha256',context),a.sha256);assert.equal(generations,28);
});
