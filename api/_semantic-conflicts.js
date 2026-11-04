const { sha256, stableStringify } = require('./_semantic-context');

const BLOCKING = new Set(['context-conflict', 'contradiction', 'relation-unresolved']);
const ACTIONS = new Set(['dismiss-false-positive', 'corrected-candidate']);
const invalid = message => Object.assign(Error(message), { status: 400, publicMessage: message });
const ruleIds = item => [...new Set(item.ruleIds || (item.ruleId ? [item.ruleId] : []))].sort();

function conflictId(item) {
 const { id, ...content } = item;
 return 'C' + sha256(stableStringify(content)).slice(0, 24);
}

function identifyConflicts(items) {
 return items.map(item => BLOCKING.has(item.type) ? { ...item, id: conflictId(item) } : item);
}

function ruleFingerprint(rule) {
 return sha256(stableStringify({ text: rule.candidateText ?? rule.quote, workflows: rule.workflows }));
}

function currentResolution(a, item) {
 const id = conflictId(item);
 const latest = (a.semantic.conflictResolutions || []).filter(entry => entry.conflictId === id).at(-1);
 const affected = ruleIds(item);
 return latest && item.type !== 'context-conflict' && affected.length > 0
  && affected.every(id => latest.ruleFingerprints[id] === ruleFingerprint(a.rules.find(rule => rule.id === id)));
}

function resolveConflicts(previous, next, draft) {
 const requested = draft.conflictResolutions;
 if (requested === undefined) return;
 if (!Array.isArray(requested) || requested.length > 64) throw invalid('Provide at most 64 explicit conflict resolutions.');
 const conflicts = new Map(next.semantic.reviewItems.filter(item => BLOCKING.has(item.type)).map(item => [conflictId(item), item]));
 const seen = new Set();
 const additions = requested.map(entry => {
  const item = conflicts.get(entry?.conflictId);
  if (!item || seen.has(entry.conflictId)) throw invalid('Unknown or repeated conflict resolution.');
  seen.add(entry.conflictId);
  if (item.type === 'context-conflict') throw invalid('Update the project or prompt context version and analyze again to resolve a context conflict.');
  const affected = ruleIds(item);
  if (!affected.length || affected.some(id => !next.rules.some(rule => rule.id === id))) throw invalid('Reanalyze conflicts without verified affected rules.');
  if (!ACTIONS.has(entry.action) || typeof entry.rationale !== 'string' || !entry.rationale.trim() || entry.rationale.length > 2000) {
   throw invalid('A conflict resolution requires an explicit action and a rationale of at most 2,000 characters.');
  }
  const evidence = entry.evidence;
  if (!Array.isArray(evidence) || !evidence.length || evidence.length > 64 || new Set(evidence).size !== evidence.length
   || evidence.some(id => !affected.some(ruleId => next.rules.find(rule => rule.id === ruleId).sources.some(source => source.id === id)))
   || affected.some(id => !next.rules.find(rule => rule.id === id).sources.some(source => evidence.includes(source.id)))) {
   throw invalid('Include verified source evidence for every affected rule.');
  }
  if (entry.action === 'corrected-candidate' && !affected.some(id => {
   const before = previous.rules.find(rule => rule.id === id);
   const after = next.rules.find(rule => rule.id === id);
   return (before.candidateText ?? before.quote) !== (after.candidateText ?? after.quote);
  })) throw invalid('A corrected-candidate resolution must include an explicit affected text correction in this review.');
  return {
   conflictId: entry.conflictId, action: entry.action, rationale: entry.rationale.trim(), evidence,
   ruleFingerprints: Object.fromEntries(affected.map(id => [id, ruleFingerprint(next.rules.find(rule => rule.id === id))]))
  };
 });
 next.semantic.conflictResolutions = [...(next.semantic.conflictResolutions || []), ...additions];
 if (next.semantic.conflictResolutions.length > 512) throw invalid('Conflict review history is full. Analyze a new proposal.');
}

function validateResolutions(a) {
 const entries = a.semantic.conflictResolutions;
 if (entries === undefined) return;
 if (!Array.isArray(entries) || entries.length > 512) throw Error('Invalid conflict resolution history.');
 const conflicts = new Map(a.semantic.reviewItems.filter(item => BLOCKING.has(item.type)).map(item => [conflictId(item), item]));
 for (const entry of entries) {
  const item = conflicts.get(entry?.conflictId);
  const affected = item && ruleIds(item);
  if (!item || item.type === 'context-conflict' || !affected.length || !ACTIONS.has(entry.action)
   || typeof entry.rationale !== 'string' || !entry.rationale.trim() || entry.rationale.length > 2000
   || !entry.ruleFingerprints || typeof entry.ruleFingerprints !== 'object' || Array.isArray(entry.ruleFingerprints)
   || Object.keys(entry.ruleFingerprints).length !== affected.length
   || affected.some(id => !/^[a-f0-9]{64}$/.test(entry.ruleFingerprints[id]))
   || !Array.isArray(entry.evidence) || !entry.evidence.length || entry.evidence.length > 64
   || new Set(entry.evidence).size !== entry.evidence.length
   || entry.evidence.some(id => !affected.some(ruleId => a.rules.find(rule => rule.id === ruleId)?.sources.some(source => source.id === id)))
   || affected.some(id => !a.rules.find(rule => rule.id === id)?.sources.some(source => entry.evidence.includes(source.id)))) {
   throw Error('Invalid conflict resolution evidence.');
  }
 }
}

module.exports = { BLOCKING, conflictId, identifyConflicts, resolveConflicts, currentResolution, validateResolutions };
