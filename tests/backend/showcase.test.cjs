const test=require('node:test'),assert=require('node:assert/strict');
const {intentRegistry}=require('../../api/_intent-registry');const {bundleFiles}=require('../../api/_export');const S=require('../../api/_showcase');
test('intent registries preserve canonical identifiers and represent shared policies honestly',()=>{
 const rules=[{id:'R1',file:'a.md',line:2,quote:'Never submit without confirmation',intents:[]},{id:'R2',file:'a.md',line:5,quote:'view_applicant navigates only',intents:['view_applicant']}];
 const policy=intentRegistry('shared',rules.slice(0,1),{adapter:'jd-viewer-v1'});assert.equal(policy.length,1);assert.equal(policy[0].kind,'shared-policy');assert(!policy[0].intent);
 const intents=intentRegistry('recruitment',rules,{});assert.equal(intents.length,1);assert.equal(intents[0].intent,'view_applicant');assert.deepEqual(intents[0].ruleIds,['R2']);
 const sample=intentRegistry('refund',rules.slice(0,1),{});assert.equal(sample[0].kind,'workflow-route');assert.equal(sample[0].intent,'refund');
});
test('fictional before fixture is bounded, mixed, repeated and contains all tested canonical intents',()=>{
 assert.equal(S.source.fictional,true);assert.equal(S.source.files.length,3);const chars=S.source.files.reduce((n,f)=>n+f.content.length,0);assert(chars>20000&&chars<50000);
 const text=S.source.files.map(f=>f.content).join('\n');for(const c of S.cases)assert(text.includes(c.expected));assert(text.split('Interview attendee exception').length>3);
 for(const c of S.cases){const out=S.prepare('before',null,c.context,c.query);assert(out.messages[0].content.includes(S.source.files[2].content));assert.equal(out.messages[1].content,JSON.stringify({request_context:c.context,utterance:c.query}));}
});
test('the independent fixture rejects equal wrong actions and invalid canonical entities',()=>{
 const c=S.cases.find(c=>c.id==='U05');assert.equal(S.score(c,{intent:'view_published_jd_applicant',entities:{applicant_name_query:'Alex Example'}}).pass,false);
 assert.equal(S.score(c,{intent:'interview_scheduling',entities:{attendee_name_query:'Alex Example'}}).pass,true);
 assert.equal(S.score(c,{intent:'interview_scheduling',entities:{attendee_name_query:'Someone Else'}}).pass,false);
});
test('uninstalled or forged after packages fail closed',()=>{assert.throws(()=>S.verifyPackage(null));assert.throws(()=>S.verifyPackage({sourceHash:'invented'}));});
test('condition grounding rejects invented containers even when their leaf exists in source',async()=>{
 const {proposeSemantic}=require('../../api/_semantic-analysis');
 const files=[{name:'rules.txt',content:'When panel_open is true, navigate to the education tab.'}];
 const provider=async messages=>({value:{rules:[{key:'a',startSectionId:JSON.parse(messages[1].content).sections[0].id,actor:'assistant',scope:'navigation',action:'navigate',conditions:[{field:'state.panel_open',op:'eq',value:true}],assignments:[{workflow:'navigation',conditions:[],rationale:'panel state'}]}],relations:[],reviewItems:[]},usage:{}});
 const a=await proposeSemantic(files,{}, {provider,limits:{maxPairs:0}});assert(a.semantic.reviewItems.some(x=>x.type==='condition-unresolved'));assert(a.rules[0].workflows.includes('shared'));assert.deepEqual(a.rules[0].conditions,[]);
});
