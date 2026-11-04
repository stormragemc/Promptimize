const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(post){
 const nodes=new Map();
 const node=id=>{if(/^T\d/.test(id))return null;if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',disabled:false,listeners:{},classList:{remove(){},toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;}});return nodes.get(id);};
 const original={sha256:'frozen',rules:[],semantic:{reviewItems:[]}};
 const ctx=vm.createContext({analysis:original,preflight:{canRun:true},files:[],testSetups:{},comparisonBudget:30000,comparisonBudgetEdited:false,results:[],approved:true,iterationHistory:[],comparisonsRunning:false,structuredClone,post,document:{getElementById:node,querySelectorAll:()=>[]},getCases:()=>[],correctionChanged(){},saveSession(){},refreshSimulation(){},show(){},console});
 ctx.window=ctx;vm.runInContext(fs.readFileSync(require.resolve('../../sample-contract'),'utf8'),ctx);vm.runInContext(fs.readFileSync(require.resolve('../../preflight-ui'),'utf8'),ctx);
 return {ctx,node,original};
}
test('the actual budget control displays the unresolved field and never enables a blocked run',async()=>{
 const ui=setup(async()=>({snapshot:'frozen',canRun:false,inputSizingComplete:false,caseChecks:[{ready:false}],blockers:[{caseId:'T04',mode:'candidate',code:'missing-rule-state',field:'event_status',detail:'event_status'}],note:'No generation started.'}));
 await ui.node('preflight').onclick();assert.equal(ui.node('run-tests').disabled,true);assert(ui.node('budget').innerHTML.includes('event_status'));assert(ui.node('budget').innerHTML.includes('Sizing incomplete'));assert(!ui.node('budget').innerHTML.includes('no input reduction or'));
});
test('editing test JSON invalidates sizing and archives results without changing the frozen prompt',()=>{
 const ui=setup(async()=>{throw Error('No automatic API call expected');});ui.ctx.results=[{case:{id:'T01'},baseline:{pass:true},candidate:{pass:true}}];
 const error={textContent:''},input={dataset:{testState:'T01',stage:'initial'},value:'{"event_status":"unknown"}',closest:()=>({querySelector:()=>error})};
 ui.node('case-list').listeners.input({target:input});assert.equal(ui.ctx.preflight,null);assert.equal(ui.node('run-tests').disabled,true);assert.equal(ui.ctx.iterationHistory.length,1);assert.equal(ui.ctx.results.length,0);assert.equal(ui.ctx.analysis,ui.original);assert.equal(ui.ctx.testSetups.T01.context.event_status,'unknown');
 input.value='{';ui.node('case-list').listeners.input({target:input});assert.equal(ui.node('preflight').disabled,true);assert(error.textContent.length>0);
});
test('a late budget response cannot enable comparisons for a different candidate',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);const ui=setup(async()=>pending);const request=ui.node('preflight').onclick();ui.ctx.analysis={sha256:'different'};release({canRun:true,inputSizingComplete:true,caseChecks:[],blockers:[]});await request;assert.equal(ui.node('run-tests').disabled,true);
});
test('raising only the allowance preserves already recorded task results',()=>{
 const ui=setup(async()=>{throw Error('No automatic request expected');});ui.ctx.results=[{case:{id:'T01'},baseline:{pass:true},candidate:{pass:true}}];
 ui.node('comparison-budget').listeners.input({target:{value:'50000'}});assert.equal(ui.ctx.results.length,1);assert.equal(ui.ctx.preflight,null);assert.equal(ui.node('run-tests').disabled,true);
});
