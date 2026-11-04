// Registry entries describe actual canonical intents or policy-only modules.
// A shared policy is not assigned an invented executable intent.
function intentRegistry(moduleId,rules,analysis){
 const entries=new Map();
 for(const rule of rules){
  for(const intent of rule.intents||[]){
   if(!entries.has(intent))entries.set(intent,{kind:'intent',intent,module:moduleId,ruleIds:[],description:rule.action||rule.quote,source:[]});
   const item=entries.get(intent);item.ruleIds.push(rule.id);item.source.push({file:rule.file,line:rule.line});
  }
 }
 // The original event sample uses these documented module IDs as routing keys.
 if(!entries.size&&analysis.adapter!=='jd-viewer-v1'&&!analysis.semantic&&['refund','cancellation','profile'].includes(moduleId))
  entries.set(moduleId,{kind:'workflow-route',intent:moduleId,module:moduleId,ruleIds:rules.map(r=>r.id),description:rules.map(r=>r.candidateText??r.quote).join('\n\n'),source:rules.map(r=>({file:r.file,line:r.line}))});
 if(!entries.size)return [{kind:moduleId==='shared'?'shared-policy':'workflow-policy',module:moduleId,appliesTo:moduleId==='shared'?'all-workflows':moduleId,ruleIds:rules.map(r=>r.id),description:rules.length?'Instructions loaded by the reviewed routing manifest; this module declares no standalone executable intent.':'This module has no assigned instructions.',source:rules.map(r=>({file:r.file,line:r.line}))}];
 return [...entries.values()];
}
module.exports={intentRegistry};
