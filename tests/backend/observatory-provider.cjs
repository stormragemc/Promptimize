// This is a deterministic protocol double. The expected runtime cases are authored separately.
const rules = [
  {
    key: 'wind-interlock',
    needle: 'Keep the dome closed at sustained wind',
    through: 'but the dome must stay closed.',
    actor: 'operator',
    scope: 'dome operations',
    action: 'Keep the dome closed at 35 km/h or more.',
    exceptions: ['The duty technician may test the latch without opening the dome.'],
    intents: ['keep_dome_closed'],
    memberships: [['observing', 'safety-gates'], ['public-visits', 'safety-gates']]
  },
  {
    key: 'confirmation-window',
    needle: 'Confirm the selected telescope before slewing.',
    through: 'does not carry to a different telescope.',
    source: 'station/safety.md',
    actor: 'operator',
    scope: 'telescope control',
    action: 'Obtain a confirmation tied to this telescope within 30 seconds.',
    intents: ['ask_confirmation'],
    memberships: [['observing', 'safety-gates']]
  },
  {
    key: 'target-selection',
    needle: 'Select the matching observation target',
    actor: 'operator',
    scope: 'target-selection phase',
    action: 'Resolve the name as an observation target.',
    conditions: [{ field: 'deskPhase', op: 'eq', value: 'target-selection' }],
    intents: ['select_target'],
    memberships: [['observing', 'target-selection']]
  },
  {
    key: 'technician-selection',
    needle: 'Select the matching duty technician',
    through: 'Do not select an observation target in this phase.',
    actor: 'operator',
    scope: 'roster-collection phase',
    action: 'Resolve the name as a duty technician and do not select an observation target.',
    conditions: [{ field: 'deskPhase', op: 'eq', value: 'roster-collection' }],
    intents: ['select_technician'],
    memberships: [['shift-staffing', 'duty-roster']]
  },
  {
    key: 'confirmation-repeat',
    needle: 'Confirm the selected telescope before slewing.',
    source: 'station/target-console.md',
    actor: 'operator',
    scope: 'telescope control',
    action: 'Confirm the selected telescope before slewing.',
    intents: ['ask_confirmation'],
    memberships: [['observing', 'safety-gates']]
  },
  {
    key: 'confirmation-rephrased',
    needle: 'Before moving a telescope',
    actor: 'operator',
    scope: 'telescope control',
    action: 'Obtain confirmation specific to the selected telescope.',
    intents: ['ask_confirmation'],
    memberships: [['observing', 'safety-gates'], ['public-visits', 'assisted-observing']]
  },
  {
    key: 'badge-confirmation',
    needle: 'Before issuing a badge',
    actor: 'visitor',
    scope: 'visitor registration',
    action: "Confirm the visitor's name before issuing a badge.",
    intents: ['ask_visitor_confirmation'],
    memberships: [['public-visits', 'registration']]
  },
  {
    key: 'inspect-safety',
    needle: 'Record the station status after the inspection.',
    exactQuote: 'Record the station status after the inspection.',
    source: 'station/safety.md',
    actor: 'operator',
    scope: 'maintenance inspection',
    action: 'Record station status after a maintenance inspection.',
    memberships: [['observing', 'safety-gates']]
  },
  {
    key: 'inspect-visit',
    needle: 'Record the station status after the inspection.',
    exactQuote: 'Record the station status after the inspection.',
    source: 'station/accessibility.txt',
    actor: 'visitor',
    scope: 'visit inspection',
    action: 'Record station status after a visit inspection.',
    memberships: [['public-visits', 'registration']]
  },
  {
    key: 'dome-notice',
    needle: 'Tell visitors when the dome is closed',
    actor: 'visitor',
    scope: 'public notice',
    action: 'Tell visitors about the dome closure.',
    intents: ['show_closure_notice'],
    memberships: [['public-visits', 'registration']]
  }
];

function extraction(input) {
  const found = [];
  for (const rule of rules) {
    const start = input.sections.findIndex(section =>
      (!rule.source || section.file === rule.source) && section.text.includes(rule.needle));
    if (start < 0) continue;
    const first = input.sections[start];
    const end = rule.through
      ? input.sections.findIndex((section, index) => index >= start && section.file === first.file && section.text.includes(rule.through))
      : start;
    if (end < start) continue;
    const conditions = rule.conditions || [];
    found.push({
      key: rule.key,
      startSectionId: first.id,
      endSectionId: input.sections[end].id,
      ...(rule.exactQuote ? { quote: rule.exactQuote } : {}),
      actor: rule.actor,
      scope: rule.scope,
      action: rule.action,
      exceptions: rule.exceptions || [],
      intents: rule.intents || [],
      conditions,
      assignments: rule.memberships.map(([workflow, subworkflow]) => ({
        workflow, subworkflow, conditions,
        rationale: 'This synthetic source documents behavior for this desk.'
      }))
    });
  }
  const has = key => found.some(rule => rule.key === key);
  const relations = [];
  if (has('technician-selection') && has('target-selection')) {
    relations.push({
      type: 'overrides',
      from: 'technician-selection',
      to: 'target-selection',
      conditions: [{ field: 'deskPhase', op: 'eq', value: 'roster-collection' }],
      rationale: 'Roster collection blocks target selection.'
    });
  }
  if (has('target-selection') && has('confirmation-window')) {
    relations.push({
      type: 'requires',
      from: 'target-selection',
      to: 'confirmation-window',
      conditions: [],
      rationale: 'A target must not be used to slew without telescope-specific confirmation.'
    });
  }
  return { rules: found, relations, reviewItems: [] };
}

function comparison(input) {
  const comparisons = input.pairs.map(pair => {
    const left = JSON.stringify(pair.left);
    const right = JSON.stringify(pair.right);
    const both = fragment => left.includes(fragment) && right.includes(fragment);
    const either = fragment => left.includes(fragment) || right.includes(fragment);
    if (either('Before moving a telescope') && either('Confirm the selected telescope before slewing.') && !either('30 seconds')) {
      return {
        id: pair.id,
        kind: 'equivalent',
        sameScope: true,
        canonical: left.includes('Before moving a telescope') ? 'right' : 'left',
        tests: ['OBS04'],
        rationale: 'Both require telescope-specific confirmation before slewing.'
      };
    }
    if (either('visitor registration') && either('telescope control')) {
      return { id: pair.id, kind: 'overlap', sameScope: false, rationale: 'Different actors, objects and operations require different confirmations.' };
    }
    if (both('telescope control')) {
      return { id: pair.id, kind: 'overlap', sameScope: true, rationale: 'Keep the explicit expiry rule in addition to the basic confirmation gate.' };
    }
    return { id: pair.id, kind: 'unrelated', sameScope: false, rationale: 'These source rules have distinct effects.' };
  });
  return { comparisons };
}

function createProvider({ alter = value => value } = {}) {
  const calls = [];
  const provider = async (messages, maxTokens, options) => {
    const stage = messages[0].content.split('\n')[0];
    const input = JSON.parse(messages[1].content);
    calls.push({ stage, input, maxTokens, reasoningEffort: options.reasoningEffort });
    const expected = stage === 'Stage: extract'
      ? extraction(input)
      : stage === 'Stage: compare'
        ? comparison(input)
        : null;
    if (!expected) throw Error('Unexpected mock provider stage');
    return {
      value: alter(expected, stage, input),
      usage: { prompt_tokens: 34, completion_tokens: 13, total_tokens: 47, completion_tokens_details: { reasoning_tokens: 5 } },
      model: 'fixture-muse-spark-1.3'
    };
  };
  return { provider, calls };
}

module.exports = { createProvider };
