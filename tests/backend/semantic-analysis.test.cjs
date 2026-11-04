const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { validateAnalysis } = require('../../api/_bundle');
const { ALGORITHM, proposeSemantic } = require('../../api/_semantic-analysis');
const { compileRuntime } = require('../../api/_semantic-runtime');
const { revise } = require('../../api/_review');
const analyze = require('../../api/analyze');
const legacy = require('../../api/_organize');
const fixture = require('./fixtures/observatory.json');
const { createProvider } = require('./observatory-provider.cjs');

function verifyCoverage(analysis, files) {
  for (const file of files) {
    const evidence = analysis.rules.flatMap(rule => rule.sources).filter(source => source.file === file.name);
    assert(evidence.length > 0, file.name);
    const covered = new Array(file.content.length).fill(false);
    for (const span of evidence) {
      const actual = file.content.slice(span.start, span.end);
      assert.equal(createHash('sha256').update(actual).digest('hex'), span.sha256);
      covered.fill(true, span.start, span.end);
    }
    assert(file.content.split('').every((character, index) => covered[index] || !character.trim()), file.name);
  }
}

function createResponse() {
  return {
    status(code) { this.code = code; return this; },
    setHeader() { return this; },
    json(data) { this.data = data; return this; }
  };
}

test('synthetic audit keeps exceptions, exact provenance and independent workflow memberships', async () => {
  const { provider, calls } = createProvider();
  const analysis = await proposeSemantic(fixture.files, fixture, { provider });
  validateAnalysis(analysis, fixture.files);
  verifyCoverage(analysis, fixture.files);
  assert(analysis.rules.some(rule => rule.quote.includes('35 km/h or more') && rule.quote.includes('the dome must stay closed')));
  assert(analysis.rules.some(rule => rule.quote.includes('30 seconds') && rule.quote.includes('does not carry')));
  const wind = analysis.rules.find(rule => rule.quote.includes('35 km/h or more'));
  assert.deepEqual(new Set(analysis.semantic.assignments.filter(item => item.ruleId === wind.id).map(item => item.workflow)), new Set(['observing', 'public-visits']));
  assert(analysis.semantic.assignments.some(item => item.workflow === 'shift-staffing' && item.subworkflow === 'duty-roster'));
  const repeated = analysis.rules.filter(rule => rule.quote === 'Record the station status after the inspection.');
  assert.deepEqual(new Set(repeated.flatMap(rule => rule.sources.map(source => source.file))), new Set(['station/safety.md', 'station/accessibility.txt']));
  assert(repeated.flatMap(rule => rule.workflows).length >= 2);
  assert(calls.some(call => call.stage === 'Stage: extract' && call.reasoningEffort === 'low'));
  assert(calls.some(call => call.stage === 'Stage: compare' && call.reasoningEffort === 'medium'));
  assert.equal(analysis.usage.total_tokens, calls.length * 47);
});

test('invalid model evidence falls back to original text and model failures keep reported usage', async () => {
  const { provider } = createProvider({
    alter(value, stage) {
      if (stage === 'Stage: compare') return value;
      return {
        rules: [{
          key: 'forged', startSectionId: value.rules[0]?.startSectionId || 'fabricated',
          quote: 'Invented behavior is allowed.', action: 'Let the dome open.'
        }],
        relations: [], reviewItems: []
      };
    }
  });
  const analysis = await proposeSemantic(fixture.files, {}, { provider });
  validateAnalysis(analysis, fixture.files);
  verifyCoverage(analysis, fixture.files);
  assert(!analysis.rules.some(rule => rule.quote.includes('Invented behavior')));
  assert(!analysis.rules.some(rule => rule.action === 'Let the dome open.'));
  assert(analysis.semantic.reviewItems.length > 0);
  const failed = await proposeSemantic(fixture.files, {}, {
    provider: async () => {
      throw Object.assign(Error('Incomplete test response'), {
        code: 'INCOMPLETE_GENERATION',
        providerUsage: { prompt_tokens: 18, completion_tokens: 26, total_tokens: 44 }
      });
    },
    limits: { maxCalls: 1 }
  });
  verifyCoverage(failed, fixture.files);
  assert.equal(failed.usage.total_tokens, 44);
  assert(failed.semantic.reviewItems.length > 0);
});

test('budget refuses before dispatching a model call and does not lose source', async () => {
  const { provider, calls } = createProvider();
  const analysis = await proposeSemantic(fixture.files, {}, {
    provider,
    limits: { maxReservedTokens: 1 }
  });
  verifyCoverage(analysis, fixture.files);
  assert.equal(calls.length, 0);
  assert(analysis.semantic.reviewItems.length > 0);
});

test('equivalence remains pending until explicit approval; overlapping visitor rules survive', async () => {
  const { provider } = createProvider();
  const analysis = await proposeSemantic(fixture.files, fixture, { provider });
  const confirmation = analysis.rules.find(rule => rule.quote.includes('Before moving a telescope'));
  const visitor = analysis.rules.find(rule => rule.quote.includes('Before issuing a badge'));
  const pending = analysis.semantic.removalProposals.find(item => item.removeRuleId === confirmation.id);
  assert(pending, 'bounded comparisons should find this equivalent paraphrase');
  assert.equal(pending.status, 'pending');
  assert(!analysis.semantic.removalProposals.some(item => item.removeRuleId === visitor.id));
  const originalModule = confirmation.workflows[0];
  assert(compileRuntime(analysis).modules[originalModule].includes(confirmation.id));
  assert.throws(() => revise(fixture.files, analysis, { approvedRemovalIds: ['bogus'] }));
  const approved = revise(fixture.files, analysis, { approvedRemovalIds: [pending.id] });
  validateAnalysis(approved, fixture.files);
  assert.equal(approved.semantic.removalProposals.find(item => item.id === pending.id).status, 'approved');
  assert(approved.rules.some(rule => rule.id === confirmation.id), 'review provenance remains immutable');
  assert(compileRuntime(approved).modules[originalModule].includes(pending.keepRuleId));
  assert(!compileRuntime(approved).modules[originalModule].includes(confirmation.id));
  assert.equal(analysis.semantic.removalProposals.find(item => item.id === pending.id).status, 'pending');
  assert.notEqual(approved.sha256, analysis.sha256);
});

test('legacy UIC analyze request keeps its historical shape and digest', async () => {
  const files = [
    { name: '_core.txt', content: 'Never invent a permission.' },
    { name: '_core_jd_request_context.txt', content: 'Stay in the viewer when the viewer is open.' },
    { name: 'rules_m2_recruitment_viewer.txt', content: '- sample_intent: Respond with a clarification.' }
  ];
  const response = createResponse();
  await analyze({ method: 'POST', body: { files } }, response);
  const original = legacy.organize(files);
  assert.equal(response.code, 200);
  assert.deepEqual(response.data, original);
  assert.equal(response.data.semantic, undefined);
  const knownLegacyHash = createHash('sha256').update(JSON.stringify({
    files, rules: original.rules, modules: original.modules
  })).digest('hex');
  assert.equal(original.sha256, knownLegacyHash);
  validateAnalysis(response.data, files);
});

test('semantic analyze is an additive route selector and uses the Standard model', async t => {
  const { provider, calls } = createProvider();
  const envKey = 'promptimizer_musespark';
  const original = process.env[envKey];
  process.env[envKey] = 'local-test-double';
  t.after(() => {
    if (original === undefined) delete process.env[envKey];
    else process.env[envKey] = original;
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'muse-spark-1.3');
    const answer = await provider(body.messages, body.max_completion_tokens, { reasoningEffort: body.reasoning_effort });
    return { ok: true, json: async () => ({
      choices: [{ message: { content: JSON.stringify(answer.value) } }],
      model: body.model, usage: answer.usage
    }) };
  });
  const response = createResponse();
  await analyze({ method: 'POST', body: {
    ...fixture,
    projectContext: { ...fixture.projectContext, version: 'route-test' },
    algorithm: ALGORITHM
  } }, response);
  assert.equal(response.code, 200, response.data?.error);
  assert.equal(response.data.semantic.algorithm, ALGORITHM);
  assert(calls.length > 0);
  validateAnalysis(response.data, fixture.files);
});

test('analysis cache is content-addressed, scoped and does not report warm calls as usage', async () => {
  const { provider, calls } = createProvider();
  const cache = new Map();
  const scoped = { provider, cache, cacheScope: 'fixture-observatory' };
  const first = await proposeSemantic(fixture.files, fixture, scoped);
  const coldCalls = calls.length;
  assert(coldCalls > 0);
  const repeat = await proposeSemantic(fixture.files, fixture, scoped);
  assert.equal(calls.length, coldCalls);
  assert.equal(repeat.sha256, first.sha256);
  assert.equal(repeat.usage.total_tokens ?? 0, 0);
  assert(repeat.semantic.calls.every(call => call.status === 'cached'));
  const updated = await proposeSemantic(fixture.files, {
    ...fixture,
    projectContext: { ...fixture.projectContext, version: 'night-shift-new' }
  }, scoped);
  assert(calls.length > coldCalls);
  assert.notEqual(updated.sha256, first.sha256);
  const afterUpdate = calls.length;
  await proposeSemantic(fixture.files, fixture, { ...scoped, cacheScope: 'another-fixture-observatory' });
  assert(calls.length > afterUpdate);
});

test('scope guard prevents a misleading model equivalence from authorizing a proposal', async () => {
  const { provider } = createProvider({
    alter(value, stage, input) {
      if (stage !== 'Stage: compare') return value;
      const visitorPairs = input.pairs.filter(pair =>
        [pair.left.scope, pair.right.scope].includes('visitor registration')
        && [pair.left.scope, pair.right.scope].includes('telescope control'));
      const ids = new Set(visitorPairs.map(pair => pair.id));
      return {
        comparisons: value.comparisons.map(item => ids.has(item.id) ? {
          ...item, kind: 'equivalent', sameScope: true, canonical: 'left', tests: ['synthetic false equivalence']
        } : item)
      };
    }
  });
  const analysis = await proposeSemantic(fixture.files, fixture, { provider });
  const visitor = analysis.rules.find(rule => rule.scope === 'visitor registration');
  const crossScope = analysis.semantic.comparisons.filter(item =>
    item.kind === 'equivalent' && [item.left, item.right].includes(visitor.id));
  assert(crossScope.length > 0, 'the visitor and telescope rule pair must reach semantic comparison');
  assert(crossScope.every(item => item.sameScope === false));
  assert(!analysis.semantic.removalProposals.some(item => [item.removeRuleId, item.keepRuleId].includes(visitor.id)));
});

test('an invented runtime condition cannot hide original requirements', async () => {
  const { provider } = createProvider({
    alter(value, stage) {
      if (stage !== 'Stage: extract') return value;
      const ungrounded = [{ field: 'weatherOverrideClearance', op: 'eq', value: 'allowed-by-anyone' }];
      return {
        ...value,
        rules: value.rules.map(rule => rule.key === 'wind-interlock' ? {
          ...rule,
          conditions: ungrounded,
          assignments: rule.assignments.map(item => ({ ...item, conditions: ungrounded }))
        } : rule)
      };
    }
  });
  const analysis = await proposeSemantic(fixture.files, fixture, { provider });
  const wind = analysis.rules.find(rule => rule.quote.includes('35 km/h or more'));
  assert(wind.quote.includes('the dome must stay closed'));
  assert.deepEqual(wind.conditions, []);
  assert(wind.workflows.includes('shared'));
  assert(analysis.semantic.reviewItems.some(item => item.type === 'condition-unresolved'));
  verifyCoverage(analysis, fixture.files);
});

test('conflicts and inferred context are inspectable and behavior fields are frozen', async () => {
  const { provider } = createProvider();
  const inferred = await proposeSemantic(fixture.files, {}, { provider });
  assert.equal(inferred.semantic.contextDraft.status, 'draft');
  const conflicting = await proposeSemantic(fixture.files, {
    ...fixture,
    projectContext: {
      ...fixture.projectContext,
      invariants: [
        ...fixture.projectContext.invariants,
        { id: 'wind-gate', text: 'Allow opening the dome at any wind speed.', authority: 'user-approved' }
      ]
    }
  }, { provider });
  assert.equal(conflicting.semantic.contextConflicts.length, 1);
  assert(!conflicting.semantic.brief.includes('wind-gate'));
  assert.throws(() => validateAnalysis({
    ...conflicting, semantic: { ...conflicting.semantic, brief: 'Open the dome.' }
  }, fixture.files), /Snapshot changed/);
  assert.throws(() => validateAnalysis({
    ...conflicting, semantic: { ...conflicting.semantic, schemaVersion: 999 }
  }, fixture.files), /Unsupported semantic analysis version/);
});

test('one rule can span adjacent source sections without losing an exception', async () => {
  const content = '## Door lock\nKeep the personnel door closed after dark.\n\n'
    + '## Maintenance exception\nOpen only during scheduled maintenance with a supervisor present.\n';
  const files = [{ name: 'door.md', content }];
  const provider = async messages => {
    const { sections } = JSON.parse(messages[1].content);
    assert.equal(sections.length, 2);
    return {
      value: {
        rules: [{
          key: 'door-with-exception',
          startSectionId: sections[0].id,
          endSectionId: sections[1].id,
          actor: 'operator',
          scope: 'station security',
          action: 'Keep the personnel door closed after dark.',
          exceptions: ['Scheduled maintenance with a supervisor present.'],
          assignments: [{ workflow: 'security', rationale: 'This rule describes access to the station.' }]
        }],
        relations: [], reviewItems: []
      },
      usage: {}
    };
  };
  const analysis = await proposeSemantic(files, {}, { provider });
  assert.equal(analysis.rules.length, 1);
  assert.equal(analysis.rules[0].quote, content);
  assert.equal(analysis.rules[0].sources[0].line, 1);
  assert.equal(analysis.rules[0].sources[0].endLine, 5);
  verifyCoverage(analysis, files);
});

test('exact same-scope repeats merge with both original spans and workflow references', async () => {
  const instruction = 'Use the currently assigned telescope.';
  const files = [
    { name: 'observing.md', content: instruction },
    { name: 'safety.md', content: instruction }
  ];
  let calls = 0;
  const provider = async messages => {
    calls++;
    const { sections } = JSON.parse(messages[1].content);
    return {
      value: {
        rules: sections.map((section, index) => ({
          key: 'instrument-' + index,
          startSectionId: section.id,
          actor: 'operator', scope: 'equipment selection', action: instruction,
          assignments: [{ workflow: index === 0 ? 'observing' : 'safety', rationale: 'The same equipment gate applies.' }]
        })),
        relations: [], reviewItems: []
      },
      usage: {}
    };
  };
  const analysis = await proposeSemantic(files, {}, { provider });
  assert.equal(calls, 1, 'an exact match requires no semantic pair call');
  assert.equal(analysis.coverage.exactDuplicates, 1);
  assert.equal(analysis.rules.length, 1);
  assert.equal(analysis.rules[0].workflows.length, 2);
  assert.equal(analysis.rules[0].sources.length, 2);
  verifyCoverage(analysis, files);
});
