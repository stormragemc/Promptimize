const {createHash}=require('node:crypto');
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'){
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 }
 return value;
}
function digest(files,a){
 if(a.semantic){
  const {calls,...semantic}=a.semantic;
  const {savedAt,...review}=a.review||{};
  const snapshot={files,rules:a.rules,modules:a.modules,paths:a.paths,adapter:a.adapter,testCases:a.testCases,
   semantic,reviewVersion:a.reviewVersion,...(a.review?{review}:{})};
  return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
 }
 return createHash('sha256').update(JSON.stringify({files,rules:a.rules,modules:a.modules,...(a.reviewVersion?{paths:a.paths,reviewVersion:a.reviewVersion,review:a.review}:{})})).digest('hex');
}
function validateAnalysis(a,files){
 if(!a||!Array.isArray(a.rules)||!a.rules.length||a.rules.length>(a.semantic?1500:a.adapter==='jd-viewer-v1'?500:18)||
  !a.modules||typeof a.modules!=='object'||Array.isArray(a.modules))throw Error('Invalid candidate');
 if(a.semantic!==undefined&&(!a.semantic||typeof a.semantic!=='object'||Array.isArray(a.semantic)))throw Error('Invalid semantic candidate');
 const ids=new Set();for(const r of a.rules){const f=files.find(f=>f.name===r.file);if((typeof r.id!=='string'||!/^R[0-9]+$/.test(r.id))||ids.has(r.id)||typeof r.quote!=='string'||!r.quote||!f?.content.includes(r.quote))throw Error('Source mapping invalid');ids.add(r.id)}
 const assigned=new Set();for(const [name,refs] of Object.entries(a.modules)){if(!(a.semantic?/^[a-z0-9][a-z0-9-]{0,62}$/.test(name):(a.adapter==='jd-viewer-v1'?['shared','workspace','applicants','evaluation','candidate-information','interview','competency','publishing','archive','editing','navigation']:['shared','refund','cancellation','profile']).includes(name))||!Array.isArray(refs)||refs.some(id=>!ids.has(id)))throw Error('Manifest invalid');refs.forEach(id=>assigned.add(id))}
 if([...ids].some(id=>!assigned.has(id)))throw Error('Unassigned rule');
 if(a.semantic)require('./_semantic-analysis').validateSemantic(a,files,ids);
 if(a.reviewVersion||a.semantic){const {validatePaths}=require('./_review');validatePaths(a.paths,a.modules,{semantic:!!a.semantic});for(const r of a.rules)if(r.candidateText!==undefined&&(typeof r.candidateText!=='string'||!r.candidateText.trim()))throw Error('Invalid corrected instruction')}
 if(a.sha256!==digest(files,a))throw Object.assign(Error('Snapshot changed'),{status:409,publicMessage:'The candidate changed. Analyze and approve a new iteration.'});
}
function messagesFor(files,a,intent,query,mode,executionContext={}){
 const ids=new Set([...(a.modules.shared||[]),...(a.modules[intent]||[])]);
 const context=mode==='baseline'?files.map(f=>`[${f.name}]\n${f.content}`).join('\n\n'):a.rules.filter(r=>ids.has(r.id)).map(r=>r.candidateText??r.quote).join('\n\n');
 if(!context)throw Error('Empty context');
 return [{role:'developer',content:`You are an event operations assistant. Follow only these promptbase instructions:\n${context}\n\nReturn JSON only: {"action":"eligible|ineligible|lookup_event_status|ask_event_id|ask_confirmation|show_profile|cancel_booking|save_profile|escalate","event_id":"string or empty"}. A lookup action asks for a simulated tool result; do not infer its result. Never claim a side effect happened when no tool ran.`},{role:'user',content:Object.keys(executionContext).length?JSON.stringify({request_context:executionContext,utterance:query}):query}];
}
module.exports={digest,validateAnalysis,messagesFor};
