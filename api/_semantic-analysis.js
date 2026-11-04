const {createHash}=require('node:crypto');
const {analyzeSemantic}=require('./_semantic');
const {normalizeContext,makeEvidence}=require('./_semantic-context');
const jd=require('./_organize');

const ALGORITHM='semantic-v1';
const EVENT_SAMPLE_FILES=['shared.md','refunds.md','cancellations.md','profile.md','router.txt'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const slug=value=>value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'workflow';
const inputError=message=>Object.assign(Error(message),{status:400,publicMessage:message});

function buildModules(rules,assignments){
 const paths={};
 const byRule=new Map(rules.map(r=>[r.id,new Set()]));
 const mapped=assignments.map(assignment=>{
  if(assignment.status==='unresolved'||!assignment.workflow)return assignment;
  const workflow=assignment.workflow.trim(), subworkflow=assignment.subworkflow?.trim()||'';
  const shared=workflow.toLowerCase()==='shared'&&!subworkflow;
  const suffix=hash(JSON.stringify([workflow,subworkflow])).slice(0,10);
  const moduleId=shared?'shared':`${slug(subworkflow||workflow)}-${suffix}`;
  paths[moduleId]=shared?'workflows/shared/prompt.md':`workflows/${slug(workflow)}/${moduleId}/prompt.md`;
  byRule.get(assignment.ruleId).add(moduleId);
  return {...assignment,moduleId};
 });
 for(const rule of rules){
  if(!byRule.get(rule.id).size||mapped.some(a=>a.ruleId===rule.id&&a.status==='unresolved')){
   byRule.get(rule.id).add('shared');
   paths.shared='workflows/shared/prompt.md';
  }
 }
 const output=rules.map(rule=>({...rule,workflows:[...byRule.get(rule.id)].sort()}));
 const modules=Object.fromEntries(Object.keys(paths).sort().map(name=>[name,output.filter(r=>r.workflows.includes(name)).map(r=>r.id)]));
 return {rules:output,modules,paths,assignments:mapped};
}

async function proposeSemantic(files,body,options){
 if(!files.some(file=>file.content.trim()))throw inputError('Add at least one file with non-whitespace content.');
 const contexts=normalizeContext(body,files);
 const result=await analyzeSemantic(files,contexts,options);
 const {rules,modules,paths,assignments}=buildModules(result.rules,result.assignments);
 const a={
  rules,modules,paths,adapter:files.length===EVENT_SAMPLE_FILES.length&&EVENT_SAMPLE_FILES.every(name=>files.some(file=>file.name===name))?'sample':ALGORITHM,model:result.model,usage:result.usage,coverage:result.coverage,
  note:'Source evidence is retained. Review workflow assignments, dependencies and pending consolidations.',
  semantic:{
   schemaVersion:1,algorithm:ALGORITHM,contextFingerprint:contexts.fingerprint,
   contextDraft:contexts.draft,brief:contexts.brief,references:contexts.references,
   contextConflicts:contexts.conflicts,promptVersion:result.promptVersion,comparisons:result.comparisons,
   diagnostics:result.diagnostics,sourceWindows:result.sourceWindows,inferredContext:result.inferredContext,
   assignments,relations:result.relations,
   removalProposals:result.removalProposals,reviewItems:result.reviewItems,calls:result.calls
  }
 };
 if(jd.detect(files)){
  a.adapter='jd-viewer-v1';
  a.testCases=jd.CASES.map(test=>({...test,evidence:rules.filter(r=>r.quote.includes(test.expected)).map(r=>({rule:r.id,file:r.file,line:r.line}))}));
 }
 const {digest,validateAnalysis}=require('./_bundle');
 a.sha256=digest(files,a);
 validateAnalysis(a,files);
 return a;
}

function approvedAliases(semantic){
 const aliases=new Map();
 const survivors=new Set();
 for(const proposal of semantic.removalProposals){
  if(proposal.status!=='approved')continue;
  const {removeRuleId,keepRuleId}=proposal;
  if(aliases.has(removeRuleId)||aliases.has(keepRuleId)||survivors.has(removeRuleId)||removeRuleId===keepRuleId){
   throw Error('Approved consolidations cannot contain competing or chained replacements.');
  }
  aliases.set(removeRuleId,keepRuleId);
  survivors.add(keepRuleId);
 }
 return aliases;
}

function approveSemantic(a,draft){
 function approve(records,ids,label){
  if(ids===undefined)return records;
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!records.some(p=>p.id===id))){
   throw inputError(`Unknown or repeated ${label} approval.`);
  }
  const selected=new Set(ids);
  return records.map(record=>selected.has(record.id)?{...record,status:'approved'}:record);
 }
 const semantic={
  ...a.semantic,
  removalProposals:approve(a.semantic.removalProposals,draft.approvedRemovalIds,'consolidation'),
  relations:approve(a.semantic.relations,draft.approvedRelationIds,'relation')
 };
 const aliases=approvedAliases(semantic);
 for(const id of [...aliases.keys(),...aliases.values()]){
  if(draft.text&&Object.hasOwn(draft.text,id)){
   const before=a.rules.find(rule=>rule.id===id);
   if(draft.text[id]!== (before.candidateText??before.quote)){
    throw inputError('Text changes affecting an approved consolidation require a new semantic analysis.');
   }
  }
 }
 for(const id of aliases.keys()){
  const kept=aliases.get(id);
  if(a.rules.some(rule=>(rule.id===id||rule.id===kept)&&rule.candidateText!==undefined)){
   throw inputError('Consolidation evidence applies to the original text. Reanalyze edited rules before consolidating.');
  }
 }
 return semantic;
}

function validateSemantic(a,files,ids){
 const s=a.semantic;
 if(s.schemaVersion!==1||s.algorithm!==ALGORITHM)throw Error('Unsupported semantic analysis version. Create a new proposal.');
 if(!/^[a-f0-9]{64}$/.test(s.contextFingerprint)||!Array.isArray(s.assignments)||!Array.isArray(s.relations)||!Array.isArray(s.removalProposals)||!Array.isArray(s.reviewItems)){
  throw Error('Invalid semantic analysis metadata.');
 }
 const sourceFiles=new Map(files.map(file=>[file.name,file.content]));
 const evidence=new Map();
 const coverage=new Map(files.map(file=>[file.name,[]]));
 for(const r of a.rules){
  if(!Array.isArray(r.sources)||!r.sources.length)throw Error('Missing source evidence.');
  for(const source of r.sources){
   const content=sourceFiles.get(source.file);
   const {id,start,end,line,endLine,sha256}=source;
   if(typeof id!=='string'||typeof content!=='string'||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>content.length||
    content.slice(start,end)!==r.quote||hash(r.quote)!==sha256){
    throw Error('Invalid source evidence.');
   }
   const expected=makeEvidence({name:source.file,content},start,end);
   if(expected.id!==id||expected.line!==line||expected.endLine!==endLine)throw Error('Invalid source location.');
   const previous=evidence.get(id);
   if(previous&&(previous.file!==source.file||previous.start!==start||previous.end!==end))throw Error('Conflicting source evidence ID.');
   evidence.set(id,source);
   coverage.get(source.file).push([start,end]);
  }
  if(!r.sources.some(source=>source.file===r.file&&source.line===r.line&&sourceFiles.get(source.file).slice(source.start,source.end)===r.quote)){
   throw Error('Original rule quote does not match its evidence.');
  }
  if(!Array.isArray(r.workflows)||!r.workflows.length||new Set(r.workflows).size!==r.workflows.length||
   r.workflows.some(name=>!a.modules[name]?.includes(r.id)))throw Error('Rule membership does not match its manifest.');
 }
 for(const [file,spans] of coverage){
  const content=sourceFiles.get(file);
  let previous=0;
  for(const [start,end] of spans.sort((left,right)=>left[0]-right[0])){
   if(start>previous&&content.slice(previous,start).trim())throw Error('Non-empty source text is missing.');
   previous=Math.max(previous,end);
  }
  if(content.slice(previous).trim())throw Error('Non-empty source text is missing.');
 }
 const references=refs=>Array.isArray(refs)&&refs.length&&refs.every(ref=>evidence.has(ref));
 const byId=new Map(a.rules.map(rule=>[rule.id,rule]));
 const backsRule=(refs,id)=>byId.get(id).sources.some(source=>refs.includes(source.id));
 for(const assignment of s.assignments){
  if(!ids.has(assignment.ruleId)||!['proposed','unresolved'].includes(assignment.status)||
   (assignment.status==='proposed'&&(!Object.hasOwn(a.modules,assignment.moduleId)||!references(assignment.evidence)||!backsRule(assignment.evidence,assignment.ruleId)))){
   throw Error('Invalid workflow assignment evidence.');
  }
 }
 for(const name of Object.keys(a.modules)){
  const members=a.modules[name];
  if(new Set(members).size!==members.length||members.some(id=>!byId.get(id).workflows.includes(name))){
   throw Error('Manifest membership does not match its rules.');
  }
 }
 const decisions=new Set();
 for(const relation of s.relations){
  if(typeof relation.id!=='string'||decisions.has(relation.id)||!ids.has(relation.from)||!ids.has(relation.to)||
   !['requires','overrides','applies_when'].includes(relation.type)||!['proposed','approved'].includes(relation.status)||!references(relation.evidence)||
   !backsRule(relation.evidence,relation.from)||!backsRule(relation.evidence,relation.to)){
   throw Error('Invalid rule relation.');
  }
  decisions.add(relation.id);
 }
 for(const removal of s.removalProposals){
  if(typeof removal.id!=='string'||decisions.has(removal.id)||removal.removeRuleId===removal.keepRuleId||
   !ids.has(removal.removeRuleId)||!ids.has(removal.keepRuleId)||
   !['pending','approved'].includes(removal.status)||!references(removal.evidence)||
   !backsRule(removal.evidence,removal.removeRuleId)||!backsRule(removal.evidence,removal.keepRuleId)||
   !Array.isArray(removal.tests)||!removal.tests.length||removal.tests.some(test=>typeof test!=='string'||!test.trim())){
   throw Error('Invalid consolidation proposal.');
  }
  decisions.add(removal.id);
 }
 approvedAliases(s);
}

module.exports={ALGORITHM,proposeSemantic,validateSemantic,approveSemantic,inputError};
