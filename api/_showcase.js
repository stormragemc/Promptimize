const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const source=require('../demo/source.json');
const {digest,validateAnalysis}=require('./_bundle');
const {compileRuntime,semanticCase,selectionReceipt}=require('./_semantic-runtime');
const {simulateJD}=require('./_simulation');
const {CASES}=require('./_organize');
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const completeContext=state=>Object.assign({jd_viewer_open:true,jd_viewer_status:'PUBLISHED',jd_evaluation_results_modal_open:false,candidate_information_modal_open:false,jd_published_viewer_active_tab:'applicants',interview_workflow_phase:null,workflow_orchestration:{primary_workflow:null},session_state:{ActiveIntent:null},payroll_workspace_open:false,travel_workspace_open:false,benefits_workspace_open:false,assets_workspace_open:false,expenses_workspace_open:false,attendance_workspace_open:false},state);
const cases=CASES.map(c=>({...c,context:completeContext(c.context)})).concat([
 {id:'F07',name:'Name-only attendee paraphrase',query:'Please add Alex Example',context:completeContext({interview_workflow_phase:'awaiting_attendee_names'}),expected:'interview_scheduling',field:'attendee_name_query',value:'Alex Example'},
 {id:'F08',name:'Leave switch paraphrase',query:'Switch to leave and start a new leave request',context:completeContext({}),expected:'apply_leave'}
]);
function readInstalled(){const file=path.join(__dirname,'../demo/generated/package.json');if(!fs.existsSync(file))return null;const pkg=JSON.parse(fs.readFileSync(file,'utf8'));const root=path.resolve(__dirname,'../demo/generated/after');for(const name of Object.keys(pkg.files)){const actual=path.resolve(root,name);if(!actual.startsWith(root+path.sep))throw Error('Invalid installed module path.');pkg.files[name]=fs.readFileSync(actual,'utf8');}return pkg;}
function verifyPackage(pkg){
 if(!pkg||pkg.sourceHash!==hash(source.files)||!pkg.analysis||!pkg.files)throw Error('The after package does not match the original fictional source.');
 validateAnalysis(pkg.analysis,source.files);
 const manifest=JSON.parse(pkg.files['manifest.json']||'null');
 if(manifest?.snapshot!==pkg.analysis.sha256)throw Error('Candidate manifest snapshot mismatch.');
 const runtime=JSON.parse(pkg.files['runtime.json']||'null');if(!runtime)throw Error('The exported semantic runtime is required.');
 const text=new Map(),intentIds=new Set();
 for(const [moduleId,file]of Object.entries(manifest.modules)){
  const content=pkg.files[file];if(typeof content!=='string'||hash(content)!==manifest.moduleHashes[moduleId])throw Error('An exported module changed after review.');
  const markers=[...content.matchAll(/^<!-- promptimize-rule:(R\d+) -->\n/gm)];
  markers.forEach((m,i)=>{const value=content.slice(m.index+m[0].length,i+1<markers.length?markers[i+1].index-2:content.length);if(text.has(m[1])&&text.get(m[1])!==value)throw Error('Shared module copies disagree.');text.set(m[1],value);});
  const registry=JSON.parse(pkg.files[file.replace(/[^/]+$/,'intents.json')]);if(!Array.isArray(registry)||!registry.length)throw Error('A module registry is empty.');const expected=require('./_intent-registry').intentRegistry(moduleId,pkg.analysis.rules.filter(r=>manifest.modules[moduleId]&&pkg.analysis.modules[moduleId].includes(r.id)),pkg.analysis);if(hash(registry)!==hash(expected))throw Error('An intent registry changed after review.');for(const entry of registry)if(entry.intent)intentIds.add(entry.intent);
 }
 const canonical=compileRuntime(pkg.analysis);for(const rule of canonical.rules){if(text.get(rule.id)!==rule.text)throw Error('An exported instruction differs from the frozen reviewed text.');}if(!require('node:util').isDeepStrictEqual(manifest.modules,pkg.analysis.paths))throw Error('Exported module paths differ from the reviewed paths.');
 if(JSON.stringify(runtime.rules.map(({text,...r})=>r))!==JSON.stringify(canonical.rules.map(({text,...r})=>r)))throw Error('Exported routing metadata differs from the reviewed analysis.');
 const plan={...canonical,rules:canonical.rules.map(rule=>({...rule,text:text.get(rule.id)??(()=>{throw Error('Exported rule text is missing.');})()}))};
 return {analysis:pkg.analysis,plan,manifest,packageHash:hash(pkg.files),intentIds:[...intentIds]};
}
function prepare(mode,pkg,context,utterance){
 const start=performance.now(),verified=mode==='after'?verifyPackage(pkg):null;
 const a=verified?.analysis||{adapter:'jd-viewer-v1'};
 const legacy=mode==='before'?require('../demo/source/loader.cjs').loadAll():null;if(legacy&&hash(legacy.files)!==hash(source.files))throw Error('Original source files changed. Reanalyze before measuring.');const out=semanticCase(legacy?.files||source.files,a,{mode:mode==='after'?'candidate':'baseline',executionContext:completeContext(context),utterance,plan:verified?.plan});
 if(!out.messages)throw Object.assign(Error('The exported runtime needs review: '+JSON.stringify(out.selection?.unresolved)),{selection:out.selection});
 return {...out,intentIds:verified?.intentIds||legacy.intents.map(x=>x.intent),retrievalMs:performance.now()-start,packageHash:verified?.packageHash||hash(source.files),selection:out.selection&&selectionReceipt(out.selection),contextCharacters:out.messages[0].content.length};
}
function score(test,answer){const action=answer.intent,entities=answer.entities||{};const pass=action===test.expected&&(!test.field||entities[test.field]===test.value);const expected={navigate_published_jd_applicant_evaluation_tab:{evaluationTab:test.value,evaluationOpen:true,jdOpen:true},close_published_jd_applicant_evaluation_results:{evaluationOpen:false,jdOpen:true},navigate_candidate_information_tab:{candidateInfoTab:test.value,candidateInfoOpen:true},view_published_jd_applicant:{selectedApplicant:'applicant-fixture-1',leaveFormOpen:false},interview_scheduling:{attendees:['Alex Example'],selectedApplicant:null,leaveFormOpen:false},apply_leave:{workspace:'leave',leaveFormOpen:true}};const sim=simulateJD({...test,assertions:expected[test.expected]},{intent:action,entities});return {pass:pass&&sim.passed,simulation:sim};}
module.exports={source,cases,hash,completeContext,readInstalled,verifyPackage,prepare,score};
