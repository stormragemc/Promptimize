const {digest,validateAnalysis}=require('./_bundle');
function validatePaths(paths,modules){
 const outputs=new Set(['manifest.json','source-map.json','review.json','evaluation.json','README.md','loader.py','run.py','cases.json','baseline.md']);
 for(const name of Object.keys(modules)){
  const p=paths?.[name];if(typeof p!=='string'||p.length>230||!p.endsWith('.md')||p.split('/').some(s=>!s||s==='.'||s==='..'||!/^[a-zA-Z0-9_][a-zA-Z0-9_. -]{0,63}$/.test(s)))throw Error('Use relative Markdown paths with valid folder names.');
  for(const file of [p,p.replace(/[^/]+$/,'intents.json')]){if(outputs.has(file))throw Error('Two outputs would use the same path: '+file);outputs.add(file)}
 }
 const list=[...outputs];for(const p of list)if(list.some(q=>q!==p&&q.startsWith(p+'/')))throw Error('A file cannot also be a folder: '+p);
}
function revise(files,a,draft){
 validateAnalysis(a,files);const next=JSON.parse(JSON.stringify(a));const names=Object.keys(a.modules);next.paths={...a.paths,...draft.paths};
 for(const m of names)if(!next.paths[m])next.paths[m]=`workflows/${m}/prompt.md`;
 if(Object.keys(next.paths).some(m=>!names.includes(m)))throw Error('Unknown module path.');validatePaths(next.paths,a.modules);
 const assignments=draft.assignments||Object.fromEntries(a.rules.map(r=>[r.id,r.workflows]));
 if(Object.keys(assignments).length!==a.rules.length||a.rules.some(r=>!Array.isArray(assignments[r.id])||!assignments[r.id].length||assignments[r.id].some(m=>!names.includes(m))))throw Error('Every source rule must belong to at least one existing module.');
 const edits=[];let total=0;
 next.rules=next.rules.map(r=>{const text=draft.text&&Object.hasOwn(draft.text,r.id)?draft.text[r.id]:(r.candidateText??r.quote);if(typeof text!=='string'||!text.trim()||text.length>50000)throw Error('Instructions must contain text.');total+=text.length;const workflows=[...new Set(assignments[r.id])];if(text!==r.quote||JSON.stringify(workflows)!==JSON.stringify(a.rules.find(x=>x.id===r.id).workflows))edits.push({rule:r.id,textChanged:text!==r.quote,workflows});return {...r,workflows,...(text!==r.quote?{candidateText:text}: {candidateText:undefined})}});
 if(total>100000)throw Error('Reviewed instructions exceed 100,000 characters.');
 next.modules=Object.fromEntries(names.map(m=>[m,next.rules.filter(r=>r.workflows.includes(m)).map(r=>r.id)]));next.reviewVersion=1;next.review={parentSnapshot:a.sha256,savedAt:new Date().toISOString(),notes:String(draft.notes===undefined?(a.review?.notes||''):draft.notes).slice(0,4000),edits};next.sha256=digest(files,next);return next;
}
module.exports={validatePaths,revise};
