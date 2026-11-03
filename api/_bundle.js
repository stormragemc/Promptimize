const {createHash}=require('node:crypto');
const digest=(files,a)=>createHash('sha256').update(JSON.stringify({files,rules:a.rules,modules:a.modules})).digest('hex');
function validateAnalysis(a,files){
 if(!a||!Array.isArray(a.rules)||!a.rules.length||a.rules.length>18||!a.modules)throw Error('Invalid candidate');
 const ids=new Set();for(const r of a.rules){const f=files.find(f=>f.name===r.file);if(typeof r.id!=='string'||ids.has(r.id)||typeof r.quote!=='string'||!r.quote||!f?.content.includes(r.quote))throw Error('Source mapping invalid');ids.add(r.id)}
 const assigned=new Set();for(const [name,refs] of Object.entries(a.modules)){if(!['shared','refund','cancellation','profile'].includes(name)||!Array.isArray(refs)||refs.some(id=>!ids.has(id)))throw Error('Manifest invalid');refs.forEach(id=>assigned.add(id))}
 if([...ids].some(id=>!assigned.has(id)))throw Error('Unassigned rule');
 if(a.sha256!==digest(files,a))throw Object.assign(Error('Snapshot changed'),{status:409,publicMessage:'The candidate changed. Analyze and approve a new iteration.'});
}
function messagesFor(files,a,intent,query,mode){
 const ids=new Set([...(a.modules.shared||[]),...(a.modules[intent]||[])]);
 const context=mode==='baseline'?files.map(f=>`[${f.name}]\n${f.content}`).join('\n\n'):a.rules.filter(r=>ids.has(r.id)).map(r=>r.quote).join('\n');
 if(!context)throw Error('Empty context');
 return [{role:'developer',content:`You are an event operations assistant. Follow only these promptbase instructions:\n${context}\n\nReturn JSON only: {"action":"eligible|ineligible|lookup_event_status|ask_event_id|ask_confirmation|show_profile|cancel_booking|save_profile|escalate","event_id":"string or empty"}. A lookup action asks for a simulated tool result; do not infer its result. Never claim a side effect happened when no tool ran.`},{role:'user',content:query}];
}
module.exports={digest,validateAnalysis,messagesFor};
