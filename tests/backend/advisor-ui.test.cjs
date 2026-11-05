const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(fetch=async()=>{throw Error('Unexpected fetch');}){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,innerHTML:'',textContent:'',listeners:{},dataset:{},classList:{toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},querySelectorAll(){return [];}});return elements.get(id);};
 element('advisor-budget').value='24000';element('fallback-rate').value='10';element('routing-overhead').value='400';element('advisor-model').value='spark';
 const ctx=vm.createContext({document:{getElementById:element,createElement:()=>({click(){}})},files:[{name:'rules.md',content:'Rules'}],analysis:{sha256:'current'},fetch,URL,Blob,setTimeout,console});
 vm.runInContext(fs.readFileSync(require.resolve('../../advisor.js'),'utf8'),ctx);
 return {ctx,element,run:script=>vm.runInContext(script,ctx)};
}
test('manual context is optional; planning unlocks only after analysis with approved context',()=>{
 const ui=setup();ui.element('project-purpose').value='HR navigation assistant';
 assert.equal(ui.run('advisorBeforeAnalyze().projectContext'),undefined);
 ui.element('context-approved').checked=true;
 assert.equal(ui.run('advisorBeforeAnalyze().projectContext.status'),'approved');
 ui.run('renderAdvisor()');assert.equal(ui.element('advisor-generate').disabled,true);
 ui.run('advisorAnalyzed();renderAdvisor()');assert.equal(ui.element('advisor-generate').disabled,false);
 ui.element('project-purpose').value='A changed project';ui.element('project-purpose').listeners.input();
 assert.equal(ui.element('context-approved').checked,false);assert.equal(ui.element('advisor-generate').disabled,true);
});
test('a late context response cannot repopulate a reset project',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const ui=setup(async()=>pending);
 ui.run("contextDocuments=[{name:'context.md',content:'Example'}]");
 const operation=ui.element('read-context').listeners.click();
 ui.run('resetAdvisor()');
 release({ok:true,json:async()=>({facts:[{id:'C1',kind:'purpose',text:'Old project',source:{file:'context.md',line:1,quote:'Example'}}],receipt:{model:'muse-spark-1.3',usage:{total_tokens:3}}})});
 await operation;assert.equal(ui.run('contextFacts.length'),0);assert.equal(ui.element('project-purpose').value,'');assert.equal(ui.run('advisorBusy'),false);
});
test('uploaded draft files are optional and require reading before inclusion',()=>{
 const ui=setup();ui.run("contextDocuments=[{name:'context.md',content:'Example'}]");
 assert.equal(ui.run('advisorBeforeAnalyze().projectContext'),undefined);
 ui.element('context-approved').checked=true;
 assert.throws(()=>ui.run('advisorBeforeAnalyze()'),/Read the uploaded context/);
});
test('download controls invalidate when the reviewed candidate snapshot changes',()=>{
 const ui=setup();ui.run("architectureReport={snapshot:'old'};renderAdvisor()");
 assert.equal(ui.run('architectureReport'),null);assert.equal(ui.element('advisor-download').disabled,true);assert.equal(ui.element('candidate-advisor-download').disabled,true);
});
test('the sample upload path enables image generation with no context, analysis or proposal and retains its result',async()=>{
 const requests=[];const ui=setup(async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});return {ok:true,json:async()=>({source:'https://example.invalid/image.png',note:'Source preview',basis:'source-preview'})};});
 ui.run('analysis=null;renderAdvisor()');assert.equal(ui.element('context-approved').checked,false);assert.equal(ui.element('input-advisor-image').disabled,false);assert.equal(ui.element('advisor-image').disabled,false);assert.equal(ui.element('advisor-generate').disabled,true);
 await ui.element('input-advisor-image').listeners.click();assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/architecture-image');assert.equal(requests[0].body.report,undefined);assert.equal(requests[0].body.projectContext,undefined);assert.equal(requests[0].body.analysis,null);
 ui.run('renderAdvisor()');assert(ui.element('input-advisor-image-result').innerHTML.includes('<img'));assert(ui.element('advisor-image-result').innerHTML.includes('<img'));assert.equal(ui.element('input-advisor-image').disabled,false);
 ui.run('files=[];renderAdvisor()');assert.equal(ui.element('input-advisor-image').disabled,true);assert.equal(ui.element('input-advisor-image-result').innerHTML,'');
});
test('an image response cannot appear after the project is reset',async()=>{
 let release;const ui=setup(async()=>new Promise(resolve=>release=resolve));ui.run('analysis=null;renderAdvisor()');const pending=ui.element('input-advisor-image').listeners.click();assert.equal(ui.element('input-advisor-image').disabled,true);ui.run('resetAdvisor();files=[];renderAdvisor()');release({ok:true,json:async()=>({source:'https://example.invalid/old.png',note:'Old'})});await pending;assert.equal(ui.run('architectureImage'),null);assert.equal(ui.element('input-advisor-image-result').innerHTML,'');
});
