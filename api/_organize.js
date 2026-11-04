// Supported adapter: preserves source paragraphs and groups JD-viewer instructions.
// Employer content is supplied at runtime, never bundled with this repository.
const {digest}=require('./_bundle');
const MODULES=['shared','workspace','applicants','evaluation','candidate-information','interview','competency','publishing','archive','editing','navigation'];
const modulePath=m=>m==='shared'?'workflows/recruitment/shared.md':`workflows/recruitment/jd-viewer/${m}/prompt.md`;
function detect(files){return files.some(f=>f.name.endsWith('_core_jd_request_context.txt'))&&files.some(f=>f.name.endsWith('rules_m2_recruitment_viewer.txt'))}
function group(text,file){
 const heading=text.split('\n')[0].toLowerCase();
 if(file.endsWith('_core.txt'))return 'shared';
 if(/workspace lock|session bias|in scope|out of scope|explicit switch|ambiguous.*viewer|same jd|ui workspace|conversation continuation|pending task focus/.test(heading))return 'workspace';
 if(/evaluation|facial|transcript/.test(heading))return 'evaluation';
 if(/candidate information|candidate_information/.test(heading))return 'candidate-information';
 if(/interview/.test(heading))return 'interview';
 if(/competency/.test(heading))return 'competency';
 if(/publish workflow|publish_job|approve.*publish/.test(heading))return 'publishing';
 if(/archive|unarchive/.test(heading))return 'archive';
 if(/applicant/.test(heading))return 'applicants';
 if(/edit_|save_|discard_|undo_|field edit|regenerate/.test(heading))return 'editing';
 if(/navigat|go back/.test(heading))return 'navigation';
 return 'shared'; // uncertain scope remains loaded; never silently discard it.
}
function organize(files){
 const rules=[],byText=new Map();let paragraphs=0,duplicates=0;
 for(const f of files){let offset=0;const regex=/\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|\r?\n[ \t]*-[ \t]+[a-z][a-z0-9_]+:|$)/g;for(const match of f.content.matchAll(regex)){
  const quote=match[0].trimEnd();if(!quote)continue;paragraphs++;const line=f.content.slice(0,match.index).split('\n').length;
  const existing=byText.get(quote);const workflow=group(quote,f.name);
  if(existing){duplicates++;existing.sources.push({file:f.name,line});if(!existing.workflows.includes(workflow))existing.workflows.push(workflow);continue}
  const r={id:`R${rules.length+1}`,file:f.name,line,quote,workflows:[workflow],sources:[{file:f.name,line}],intents:[...(quote.match(/^[- \t]*([a-z][a-z0-9_]+):/)||[]).slice(1)]};rules.push(r);byText.set(quote,r);
 }}
 const modules=Object.fromEntries(MODULES.map(m=>[m,rules.filter(r=>r.workflows.includes(m)).map(r=>r.id)]).filter(([,ids])=>ids.length));
 const a={adapter:'jd-viewer-v1',rules,modules,model:'Source-preserving JD viewer adapter',testCases:CASES,usage:{},coverage:{sourceParagraphs:paragraphs,uniqueParagraphs:rules.length,exactDuplicates:duplicates},paths:Object.fromEntries(Object.keys(modules).map(m=>[m,modulePath(m)])),note:'Every non-empty source paragraph is retained. Only exact duplicate paragraphs are consolidated. Scope assignments require review.'};a.sha256=digest(files,a);return a;
}
function selectModules(context={}){
 const needed=['shared','workspace'];
 if(context.jd_evaluation_results_modal_open)needed.push('applicants','evaluation');
 else if(context.candidate_information_modal_open)needed.push('applicants','candidate-information');
 else if(context.interview_workflow_phase)needed.push('applicants','interview');
 else if(context.jd_published_viewer_active_tab==='applicants')needed.push('applicants','interview');
 else needed.push(...MODULES.filter(m=>!needed.includes(m))); // unknown UI: conservative full-context fallback
 return needed;
}
function classifyMessages(files,a,test,mode){const selected=selectModules(test.context);const ids=new Set(selected.flatMap(m=>a.modules[m]||[]));const text=mode==='baseline'?files.map(f=>f.content).join('\n\n'):[...new Set(selected.flatMap(m=>a.modules[m]||[]))].map(id=>{const r=a.rules.find(r=>r.id===id);return r.candidateText??r.quote}).join('\n\n');return [{role:'developer',content:`Classify the HR assistant request using the following instructions. Return JSON only: {"intent":"canonical intent name","entities":{}}. Preserve canonical entity field names. Do not execute HR actions.\n\n${text}`},{role:'user',content:JSON.stringify({request_context:test.context,utterance:test.query})}]}
const CASES=[
 {id:'U01',intent:'jd-viewer',name:'Evaluation tab takes precedence',query:'Show me the facial analysis',context:{jd_viewer_open:true,jd_viewer_status:'PUBLISHED',jd_evaluation_results_modal_open:true},expected:'navigate_published_jd_applicant_evaluation_tab',field:'evaluation_results_tab',value:'facial'},
 {id:'U02',intent:'jd-viewer',name:'Close the evaluation modal only',query:'Close this',context:{jd_viewer_open:true,jd_viewer_status:'PUBLISHED',jd_evaluation_results_modal_open:true},expected:'close_published_jd_applicant_evaluation_results'},
 {id:'U03',intent:'jd-viewer',name:'Candidate information tab',query:'Go to education',context:{jd_viewer_open:true,jd_viewer_status:'PUBLISHED',candidate_information_modal_open:true},expected:'navigate_candidate_information_tab',field:'candidate_information_tab',value:'education'},
 {id:'U04',intent:'jd-viewer',name:'Applicant selection overrides stale leave',query:'Show me applicant Alex Example',context:{jd_viewer_open:true,jd_viewer_status:'PUBLISHED',jd_published_viewer_active_tab:'applicants',entity_domain_hint:'candidate',workflow_orchestration:{primary_workflow:'leave',phase:'collecting'},session_state:{ActiveIntent:'apply_leave'}},expected:'view_published_jd_applicant',field:'applicant_name_query',value:'Alex Example'}
];
module.exports={detect,organize,modulePath,selectModules,classifyMessages,CASES};
