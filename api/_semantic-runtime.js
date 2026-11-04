const RUNTIME_VERSION = 1;
const MAX_CONTEXT_CHARS = 50000;
const EXECUTION_TOKEN_BUDGET = 20000;
const OUTPUT_RESERVE = 750;
const {currentResolution}=require('./_semantic-conflicts');
const JD_ADAPTER = 'jd-viewer-v1';
// The JD fixture state is sparse. An open JD viewer can omit inactive
// panels, workspace flags and prior-session hints. Explicit values still win.
const OPTIONAL_JD_STATE = new Map([
 ['jd_evaluation_results_modal_open',false],['candidate_information_modal_open',false],
 ['jd_published_viewer_active_tab',null],['interview_workflow_phase',null],['entity_domain_hint',null],
 ['workflow_orchestration.primary_workflow',null],['workflow_orchestration.phase',null],['session_state.ActiveIntent',null],
 ['payroll_workspace_open',false],['travel_workspace_open',false],['benefits_workspace_open',false],
 ['assets_workspace_open',false],['expenses_workspace_open',false],['attendance_workspace_open',false]
]);
const STOP_WORDS = new Set('a an and are as at be by for from has have i in is it me my of on or that the this to was we with you your'.split(' '));

const unique = values => [...new Set(values)];
function terms(text) {
 const matches = String(text ?? '').toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) || [];
 return unique(matches.flatMap(word => [word, ...word.split(/[_-]/)]).filter(word => word.length > 1 && !STOP_WORDS.has(word)));
}
const own = (object, key) => object != null && typeof object === 'object' && Object.hasOwn(object, key);
function readField(state, name) {
 let value = state;
 for (const key of name.split('.')) {
  if (!own(value, key)) return {present:false};
  value = value[key];
 }
 return {present:true,value};
}
function conditionResult(conditions, state, adapter) {
 const missing = [];
 for (const condition of conditions || []) {
  const field = readField(state, condition.field);
  if (condition.op === 'present' || condition.op === 'absent') {
   if (field.present !== (condition.op === 'present')) return {matches:false,missing:[]};
  } else {
   const hasDefault = adapter === JD_ADAPTER && state.jd_viewer_open === true && OPTIONAL_JD_STATE.has(condition.field);
   if (!field.present && !hasDefault) missing.push(condition.field);
   else if (((field.present ? field.value : OPTIONAL_JD_STATE.get(condition.field)) === condition.value) !== (condition.op === 'eq')) {
    return {matches:false,missing:[]};
   }
  }
 }
 return {matches:missing.length ? null : true,missing};
}

function ruleAliases(a) {
 const direct = new Map();
 for (const item of a.semantic?.removalProposals || []) {
  if (item.status !== 'approved') continue;
  if (direct.has(item.removeRuleId)) throw Error('Multiple approved replacements for one rule.');
  direct.set(item.removeRuleId, item.keepRuleId);
 }
 const known = new Set(a.rules.map(rule => rule.id));
 const aliases = {};
 for (const [from, to] of direct) {
  if (!known.has(from) || !known.has(to)) throw Error('Approved replacement references an unknown rule.');
  let target = to;
  const visited = new Set([from]);
  while (direct.has(target)) {
   if (visited.has(target)) throw Error('Approved replacements form a cycle.');
   visited.add(target);
   target = direct.get(target);
  }
  if (!known.has(target)) throw Error('Approved replacement references an unknown rule.');
  aliases[from] = target;
 }
 return aliases;
}
function activeModuleRules(a, aliases = ruleAliases(a)) {
 return Object.fromEntries(Object.entries(a.modules).map(([module, ids]) => [
  module, unique(ids.map(id => aliases[id] || id))
 ]));
}
function compileRuntime(a) {
 if (a.semantic?.schemaVersion !== 1 || a.semantic.algorithm !== 'semantic-v1') throw Error('Unsupported semantic analysis version.');
 const aliases = ruleAliases(a);
 const assignments = new Map();
 for (const item of a.semantic.assignments || []) {
  const prior = assignments.get(item.ruleId) || [];
  prior.push({
   workflow:item.workflow,subworkflow:item.subworkflow,
   moduleId:item.moduleId,conditions:item.conditions || [],status:item.status
  });
  assignments.set(item.ruleId, prior);
 }
 const rules = a.rules.map(rule => ({
  id:rule.id,activeId:aliases[rule.id] || rule.id,
  ...(!aliases[rule.id] ? {text:rule.candidateText ?? rule.quote} : {}),
  conditions:rule.conditions || [],workflows:rule.workflows || [],
  assignments:(assignments.get(rule.id) || []).filter(item => !item.moduleId || (rule.workflows || []).includes(item.moduleId)),
  intents:rule.intents || [],terms:terms(rule.candidateText ?? rule.quote)
 }));
 const relations = (a.semantic.relations || []).map(edge => ({
  type:edge.type,from:aliases[edge.from] || edge.from,to:aliases[edge.to] || edge.to,
  conditions:edge.conditions || []
 })).filter((edge, i) => edge.from !== edge.to || a.semantic.relations[i].from === a.semantic.relations[i].to);
 const conflicts = (a.semantic.reviewItems || []).filter(item => ['context-conflict','contradiction','relation-unresolved'].includes(item.type) && !currentResolution(a,item))
  .map(item => ({type:item.type,ruleIds:unique((item.ruleIds || (item.ruleId ? [item.ruleId] : [])).map(id => aliases[id] || id))}));
 const hasSourceConflict = conflicts.some(conflict => conflict.type === 'context-conflict');
 return {
  runtimeVersion:RUNTIME_VERSION,adapter:a.adapter || 'semantic-v1',snapshot:a.sha256,
  brief:hasSourceConflict ? '' : (a.semantic.brief || ''),
  references:hasSourceConflict ? [] : (a.semantic.references || []).filter(ref => ref.authority === 'user-approved'),
  rules,modules:activeModuleRules(a, aliases),relations,ruleAliases:aliases,conflicts
 };
}

function addReason(list, code, detail) {
 if (!list.some(item => item.code === code && item.detail === detail)) list.push({code,detail});
}
function requestModules(state, intent) {
 return unique([intent,state.workflow,state.subworkflow,state.intent].filter(value => typeof value === 'string' && value));
}
function legacyJDTerms(state) {
 if (state.jd_evaluation_results_modal_open === true) return ['jd_evaluation_results_modal_open','evaluation'];
 if (state.candidate_information_modal_open === true) return ['candidate_information_modal_open','candidate_information'];
 if (typeof state.interview_workflow_phase === 'string' && state.interview_workflow_phase) return ['interview_workflow_phase',state.interview_workflow_phase];
 if (state.jd_published_viewer_active_tab === 'applicants') return ['jd_published_viewer_active_tab','applicants'];
 return [];
}
function matchesAssignment(assignment, requested) {
 return requested.some(name => name === assignment.moduleId || name === assignment.workflow || name === assignment.subworkflow
  || name === assignment.workflow + '/' + assignment.subworkflow
  || name === assignment.workflow + '-' + assignment.subworkflow);
}
function relationClosure(plan, seed, state, fallbackReasons, unresolved, known, recordMissingState = true) {
 const selected = new Set(seed);
 const edges = new Map();
 for (const edge of plan.relations) {
  const related = edges.get(edge.from) || [];
  related.push([edge.to,edge.conditions]);
  edges.set(edge.from, related);
  if (edge.type === 'overrides' && edge.from !== edge.to) {
   const incoming = edges.get(edge.to) || [];
   incoming.push([edge.from,edge.conditions]);
   edges.set(edge.to, incoming);
  }
 }
 for (const id of selected) {
  for (const [target, conditions] of edges.get(id) || []) {
   const relation = conditionResult(conditions, state, plan.adapter);
   if (relation.matches === false) continue;
   for (const field of recordMissingState ? relation.missing : []) {
    addReason(fallbackReasons,'missing-relation-state',field);
    addReason(unresolved,'missing-relation-state',field);
   }
   if (known.has(target)) selected.add(target);
   else {
    addReason(fallbackReasons,'missing-dependency',target);
    addReason(unresolved,'missing-dependency',target);
   }
  }
 }
 return selected;
}
function cycleMembers(plan, selected, state) {
 const outgoing = new Map();
 for (const edge of plan.relations) {
  if (!selected.has(edge.from) || !selected.has(edge.to) || conditionResult(edge.conditions, state, plan.adapter).matches === false) continue;
  const prior = outgoing.get(edge.from) || [];
  prior.push(edge.to);
  outgoing.set(edge.from, prior);
 }
 let index = 0;
 const indexes = new Map(), lowLinks = new Map(), stack = [], stacked = new Set(), cycles = new Set();
 function visit(id) {
  indexes.set(id,index);
  lowLinks.set(id,index++);
  stack.push(id);
  stacked.add(id);
  for (const next of outgoing.get(id) || []) {
   if (!indexes.has(next)) {
    visit(next);
    lowLinks.set(id,Math.min(lowLinks.get(id),lowLinks.get(next)));
   } else if (stacked.has(next)) lowLinks.set(id,Math.min(lowLinks.get(id),indexes.get(next)));
  }
  if (lowLinks.get(id) !== indexes.get(id)) return;
  const component = [];
  let node;
  do {
   node = stack.pop();
   stacked.delete(node);
   component.push(node);
  } while (node !== id);
  if (component.length > 1 || outgoing.get(id)?.includes(id)) for (const member of component) cycles.add(member);
 }
 for (const id of selected) if (!indexes.has(id)) visit(id);
 return cycles;
}
function renderContext(plan, rules, broader) {
 const blocks = [];
 if (plan.brief) blocks.push('Approved project routing brief (source instructions and approved rule corrections take precedence):\n' + plan.brief);
 blocks.push(...rules.map(rule => rule.text));
 if (broader) {
  for (const reference of plan.references) blocks.push('Approved project reference [' + reference.id + '] ' + reference.title + ' (source instructions take precedence)\n' + reference.text);
 }
 return blocks.join('\n\n');
}
function checkConflicts(plan, selected, fallbackReasons, unresolved) {
 for (const conflict of plan.conflicts || []) {
  const {type,ruleIds} = conflict;
  const relevant = type === 'contradiction' ? ruleIds.length > 1 && ruleIds.every(id => selected.has(id))
   : !ruleIds.length || ruleIds.some(id => selected.has(id));
  if (!relevant) continue;
  const detail = ruleIds.join(',') || 'project-context';
  addReason(fallbackReasons,type,detail);
  addReason(unresolved,type,detail);
 }
}

// Every route into the selection must obey state requirements, including lexical
// ranking, explicit rule IDs, shared rules and dependency closure.
function checkSelectedState(plan, selected, state, fallbackReasons, unresolved) {
 for (const rule of plan.rules) {
  if (!selected.has(rule.activeId)) continue;
  const result = conditionResult(rule.conditions,state,plan.adapter);
  const fields = [...result.missing];
  const assignments = rule.assignments.filter(item => item.status !== 'unresolved');
  const placements = assignments.map(item => conditionResult(item.conditions,state,plan.adapter));
  if (!rule.workflows.includes('shared') && placements.length && !placements.some(item => item.matches === true)) {
   fields.push(...placements.flatMap(item => item.missing));
  }
  for (const field of unique(fields)) {
   addReason(fallbackReasons,'missing-rule-state',field);
   addReason(unresolved,'missing-rule-state',field);
  }
 }
}

function selectContext(plan, {executionContext={},utterance='',intent,requireRuleIds=[],maxContextChars=MAX_CONTEXT_CHARS}={}) {
 if (plan.runtimeVersion !== RUNTIME_VERSION) throw Error('Unsupported semantic runtime version.');
 if (!executionContext || typeof executionContext !== 'object' || Array.isArray(executionContext)) throw Error('Execution context must be an object.');
 if (!Number.isInteger(maxContextChars) || maxContextChars < 1 || maxContextChars > MAX_CONTEXT_CHARS) throw Error('Invalid context character limit.');
 const state = executionContext;
 const fallbackReasons = [], unresolved = [];
 const activeRules = plan.rules.filter(rule => rule.id === rule.activeId);
 const known = new Set(activeRules.map(rule => rule.id));
 const requested = requestModules(state,intent);
 const seed = new Set(plan.modules.shared || []);
 let anchored = false;
 const conditional = new Map();
 const excluded = new Set();
 for (const rule of plan.rules) {
  const result = conditionResult(rule.conditions,state,plan.adapter);
  conditional.set(rule.id,result);
  const assignments = rule.assignments.filter(assignment => assignment.status !== 'unresolved');
  const eligibleAssignments = assignments.map(assignment => ({
   named:matchesAssignment(assignment,requested), hasConditions:assignment.conditions.length > 0,
   conditions:conditionResult(assignment.conditions,state,plan.adapter)
  }));
  const allPlacementsGuarded = assignments.length > 0 && !rule.workflows.includes('shared')
   && rule.workflows.every(workflow => assignments.some(item => item.moduleId === workflow));
  if (result.matches === false || (allPlacementsGuarded && eligibleAssignments.every(item => item.conditions.matches === false))) excluded.add(rule.id);
  const directAssignments = eligibleAssignments.filter(assignment => assignment.named
   || (assignment.hasConditions && assignment.conditions.matches === true));
  const directModule = rule.workflows.some(workflow => workflow !== 'shared' && requested.includes(workflow))
   && !assignments.some(assignment => matchesAssignment(assignment,requested));
  const matchedAssignment = directAssignments.some(assignment => assignment.conditions.matches === true);
  const direct = directModule || matchedAssignment || (rule.conditions.length > 0 && result.matches === true);
  if (direct && !excluded.has(rule.id)) {
   seed.add(rule.activeId);
   if (result.matches === true) anchored = true;
  }
  const allAssignmentStateMissing = !matchedAssignment && directAssignments.length > 0
   && directAssignments.every(assignment => assignment.conditions.matches === null);
  if ((direct && result.matches === null) || (allAssignmentStateMissing && result.matches !== false)) {
   for (const field of unique([...result.missing,...directAssignments.flatMap(assignment => assignment.conditions.missing)])) {
    addReason(fallbackReasons,'missing-rule-state',field);
    addReason(unresolved,'missing-rule-state',field);
   }
  }
 }
 const stateTerms = plan.adapter === JD_ADAPTER ? legacyJDTerms(state) : [];
 const queryTerms = terms(utterance);
 const frequencies = new Map();
 for (const rule of plan.rules) {
  for (const term of rule.terms) frequencies.set(term,(frequencies.get(term) || 0) + 1);
 }
 const ranked = plan.rules.flatMap((rule,index) => {
  if (excluded.has(rule.id)) return [];
  const words = new Set(rule.terms);
  const namedIntent = rule.intents.some(name => queryTerms.includes(name.toLowerCase()) || requested.includes(name));
  const stateHits = stateTerms.filter(term => words.has(term)).length;
  const hits = queryTerms.filter(term => words.has(term));
  const rare = hits.filter(term => frequencies.get(term) * 2 <= plan.rules.length).length;
  const score = (namedIntent ? 60 : 0) + 20 * stateHits + 4 * rare + hits.length;
  return score >= 5 ? [{rule,index,score}] : [];
 }).sort((left,right) => right.score - left.score || left.index - right.index);
 const rankedIds = new Set();
 for (const {rule} of ranked) {
  if (rankedIds.has(rule.activeId)) continue;
  rankedIds.add(rule.activeId);
  seed.add(rule.activeId);
  anchored = true;
  if (rankedIds.size === 8) break;
 }
 for (const id of requireRuleIds) {
  const active = plan.ruleAliases[id] || id;
  if (known.has(active)) {
   seed.add(active);
   anchored = true;
  } else {
   addReason(fallbackReasons,'missing-required-rule',id);
   addReason(unresolved,'missing-required-rule',id);
  }
 }
 if (plan.adapter === JD_ADAPTER && state.interview_workflow_phase === 'awaiting_attendee_names') {
  const phaseEvidence = plan.rules.filter(rule => conditional.get(rule.id).matches !== false && (
   rule.terms.includes('awaiting_attendee_names') || rule.conditions.some(condition =>
    condition.field === 'interview_workflow_phase' && condition.op === 'eq' && condition.value === 'awaiting_attendee_names'
   )
  ));
  if (!phaseEvidence.length) {
   addReason(fallbackReasons,'missing-phase-evidence','interview_workflow_phase');
   addReason(unresolved,'missing-phase-evidence','interview_workflow_phase');
  }
  for (const rule of phaseEvidence) seed.add(rule.activeId);
 }
 if (!anchored) addReason(fallbackReasons,'no-narrow-match','request workflow or source rule');
 let selected = relationClosure(plan,seed,state,fallbackReasons,unresolved,known);
 checkSelectedState(plan,selected,state,fallbackReasons,unresolved);
 checkConflicts(plan,selected,fallbackReasons,unresolved);
 if (fallbackReasons.length) {
  selected = relationClosure(plan,activeRules.map(rule => rule.id),state,fallbackReasons,unresolved,known,!anchored);
  checkSelectedState(plan,selected,state,fallbackReasons,unresolved);
  checkConflicts(plan,selected,fallbackReasons,unresolved);
 }
 const rules = activeRules.filter(rule => selected.has(rule.id));
 const cycles = cycleMembers(plan,selected,state);
 const text = renderContext(plan,rules,fallbackReasons.length > 0);
 if (!rules.length) addReason(unresolved,'missing-source','no retained instructions');
 if (text.length > maxContextChars) addReason(unresolved,'context-budget-exceeded',String(maxContextChars));
 return {
  status:unresolved.length ? 'unresolved' : 'ready',
  tier:fallbackReasons.length ? 'broader' : 'compact',
  fallbackExpansions:fallbackReasons.length ? 1 : 0,
  fallbackReasons,unresolved,cycles:rules.filter(rule => cycles.has(rule.id)).map(rule => rule.id),
  ruleIds:rules.map(rule => rule.id),
  modules:Object.keys(plan.modules).filter(name => plan.modules[name].some(id => selected.has(id))),
  contextCharacters:text.length,text:unresolved.length ? '' : text
 };
}

function selectionReceipt(selection) {
 const {text,...receipt} = selection;
 return receipt;
}
function requestUnresolved(receipt, detail) {
 return {
  ...receipt,status:'unresolved',
  unresolved:[...(receipt?.unresolved || []),{code:'execution-token-budget-exceeded',detail:String(detail)}]
 };
}
function semanticCase(files,a,{mode,executionContext={},utterance,intent,requireRuleIds,plan}) {
 const adapter = a.adapter || 'semantic-v1';
 let selection;
 let text;
 if (mode === 'candidate') {
  selection = selectContext(plan || compileRuntime(a),{executionContext,utterance,intent,requireRuleIds});
  if (selection.status !== 'ready') return {selection};
  text = selection.text;
 } else {
  text = files.map(file => adapter === JD_ADAPTER ? file.content : `[${file.name}]\n${file.content}`).join('\n\n');
 }
 const envelope = JSON.stringify({request_context:executionContext,utterance});
 let developer, user;
 if (adapter === JD_ADAPTER) {
  developer = 'Classify the HR assistant request using the following instructions. Return JSON only: {"intent":"canonical intent name","entities":{}}. Preserve canonical entity field names. Do not execute HR actions.\n\n' + text;
  user = envelope;
 } else if (adapter === 'sample') {
  developer = 'You are an event operations assistant. Follow only these promptbase instructions:\n' + text + '\n\nReturn JSON only: {"action":"eligible|ineligible|lookup_event_status|ask_event_id|ask_confirmation|show_profile|cancel_booking|save_profile|escalate","event_id":"string or empty"}. A lookup action asks for a simulated tool result; do not infer its result. Never claim a side effect happened when no tool ran.';
  user = Object.keys(executionContext).length ? envelope : utterance;
 } else {
  developer = 'Follow these promptbase instructions. Return a JSON object. Do not execute side effects.\n\n' + text;
  user = envelope;
 }
 return {selection,messages:[{role:'developer',content:developer},{role:'user',content:user}]};
}
module.exports = {
 RUNTIME_VERSION,MAX_CONTEXT_CHARS,EXECUTION_TOKEN_BUDGET,OUTPUT_RESERVE,
 ruleAliases,activeModuleRules,compileRuntime,selectContext,selectionReceipt,requestUnresolved,semanticCase,
 semanticLoader:require('./_semantic-python')
};
