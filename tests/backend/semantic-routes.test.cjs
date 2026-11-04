const assert = require('node:assert/strict');
const test = require('node:test');
const classifyCase = require('../../api/classify-case');
const packageCheck = require('../../api/package-check');
const exportZip = require('../../api/export');
const preflight = require('../../api/preflight');
const runCase = require('../../api/run-case');
const jd = require('../../api/_organize');
const { proposeSemantic } = require('../../api/_semantic-analysis');
const { revise } = require('../../api/_review');
const { semanticCase } = require('../../api/_semantic-runtime');
const fixture = require('./fixtures/observatory.json');
const { createProvider } = require('./observatory-provider.cjs');

const jdFiles = [
  { name: '_core.txt', content: 'Never invent a permission.' },
  { name: '_core_jd_request_context.txt', content: 'When the evaluation modal is open, it takes precedence.' },
  { name: 'rules_m2_recruitment_viewer.txt', content: '- navigate_published_jd_applicant_evaluation_tab: Navigate the requested evaluation result tab.' }
];

const eventFiles = [
  { name: 'shared.md', content: 'Use only known event IDs.' },
  { name: 'refunds.md', content: 'An organizer cancellation overrides the refund window.' },
  { name: 'cancellations.md', content: 'Ask for owner confirmation before cancellation.' },
  { name: 'profile.md', content: 'Display profiles in read-only mode.' },
  { name: 'router.txt', content: 'Route requests to the appropriate event workflow.' }
];

const emptyExtraction = async () => ({
  value: { rules: [], relations: [], reviewItems: [] }, usage: {}
});

async function post(handler, body) {
  const response = {
    headers: {},
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(value) { this.data = value; return this; },
    end(value) { this.data = value; return this; }
  };
  await handler({ method: 'POST', body }, response);
  return response;
}

function mockMeta(t, { tokenCount = 37, answers = [] } = {}) {
  const calls = [];
  const envKey = 'promptimizer_musespark';
  const original = process.env[envKey];
  process.env[envKey] = 'route-test-double';
  t.after(() => {
    if (original === undefined) delete process.env[envKey];
    else process.env[envKey] = original;
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'muse-spark-1.3');
    calls.push({ url, body });
    if (url.endsWith('/responses/input_tokens')) return { ok: true, json: async () => ({ input_tokens: tokenCount }) };
    assert(url.endsWith('/chat/completions'));
    assert.equal(body.reasoning_effort, 'minimal');
    const value = answers.shift();
    assert(value, 'unexpected generation');
    return { ok: true, json: async () => ({
      choices: [{ message: { content: JSON.stringify(value) } }],
      model: body.model, usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
    }) };
  });
  return calls;
}

test('semantic package check and export keep the route and ZIP contracts', async () => {
  const { provider } = createProvider();
  const proposed = await proposeSemantic(fixture.files, fixture, { provider });
  const draft = { approvedRemovalIds: [proposed.semantic.removalProposals[0].id] };
  const analysis = revise(fixture.files, proposed, draft);
  const checked = await post(packageCheck, { files: fixture.files, analysis });
  assert.equal(checked.code, 200, checked.data?.error);
  assert.equal(checked.data.snapshot, analysis.sha256);
  assert(checked.data.fileCount > 0 && checked.data.bytes > 0);
  assert(checked.data.checks.every(check => check.pass));
  const exported = await post(exportZip, { files: fixture.files, analysis, results: [] });
  assert.equal(exported.code, 200);
  assert.equal(exported.headers['Content-Type'], 'application/zip');
  assert.equal(exported.data.readUInt32LE(0), 0x04034b50);
});

test('JD semantic route preserves classification and simulated dispatch fields', async t => {
  const analysis = await proposeSemantic(jdFiles, {}, { provider: emptyExtraction });
  const scenario = jd.CASES[0];
  const value = { intent: scenario.expected, entities: { [scenario.field]: scenario.value } };
  const calls = mockMeta(t, { answers: [value, value] });
  for (const mode of ['baseline', 'candidate']) {
    const response = await post(classifyCase, { files: jdFiles, analysis, test: { id: scenario.id }, mode });
    assert.equal(response.code, 200, response.data?.error);
    assert.equal(response.data.status, 'completed');
    assert.equal(response.data.pass, true);
    assert.equal(response.data.snapshot, analysis.sha256);
    assert.equal(response.data.answer.action, scenario.expected);
    assert.equal(response.data.simulation.adapterDispatch, true);
    assert.equal(response.data.simulation.steps.find(step => step.type === 'tool').executed, true);
    assert.equal(response.data.simulation.finalState.evaluationTab, 'facial');
  }
  assert.equal(calls.length, 4);
  for (let index = 0; index < calls.length; index += 2) {
    assert.deepEqual(calls[index].body.input, calls[index + 1].body.messages);
    assert.equal(calls[index + 1].body.max_completion_tokens, 750);
  }
});

test('JD semantic route refuses over-budget baseline and candidate before generation', async t => {
  const analysis = await proposeSemantic(jdFiles, {}, { provider: emptyExtraction });
  const calls = mockMeta(t, { tokenCount: 20000 });
  for (const mode of ['baseline', 'candidate']) {
    const response = await post(classifyCase, { files: jdFiles, analysis, test: { id: jd.CASES[0].id }, mode });
    assert.equal(response.code, 200, response.data?.error);
    assert.equal(response.data.status, 'incomplete');
    assert.equal(response.data.pass, null);
    assert.equal(response.data.snapshot, analysis.sha256);
  }
  assert.equal(calls.length, 2);
  assert(calls.every(call => call.url.endsWith('/responses/input_tokens')));
});

test('semantic event route preserves its bounded lookup trace', async t => {
  const analysis = await proposeSemantic(eventFiles, {}, { provider: emptyExtraction });
  assert.equal(analysis.adapter, 'sample');
  const scenario = { id: 'T04', intent: 'refund', expected: 'eligible', query: 'The status of event EV-7 is unknown.' };
  const calls = mockMeta(t, { answers: [{ action: 'lookup_event_status', event_id: 'EV-7' }, { action: 'eligible' }] });
  const response = await post(runCase, { files: eventFiles, analysis, test: scenario, mode: 'candidate' });
  assert.equal(response.code, 200, response.data?.error);
  assert.equal(response.data.pass, true);
  assert.equal(response.data.status, 'completed');
  assert.equal(response.data.toolCalls.length, 1);
  assert.equal(response.data.toolCalls[0].executed, true);
  assert.equal(response.data.simulation.kind, 'event-operations');
  assert.equal(response.data.usage.total_tokens, 24);
  const generations = calls.filter(call => call.url.endsWith('/chat/completions'));
  assert.equal(generations.length, 2);
  const planned = semanticCase(eventFiles, analysis, { mode: 'candidate', utterance: scenario.query, intent: scenario.intent });
  assert.deepEqual(generations[0].body.messages, planned.messages);
});

test('JD semantic preflight sizes the same candidate request used during classification', async t => {
  const analysis = await proposeSemantic(jdFiles, {}, { provider: emptyExtraction });
  const calls = mockMeta(t);
  const response = await post(preflight, { files: jdFiles, analysis });
  assert.equal(response.code, 200, response.data?.error);
  assert.equal(response.data.snapshot, analysis.sha256);
  assert(Number.isInteger(response.data.generationCallsMax));
  const sample = jd.CASES[0];
  const node = semanticCase(jdFiles, analysis, {
    mode: 'candidate', executionContext: sample.context, utterance: sample.query, intent: sample.intent
  });
  assert(calls.some(call => JSON.stringify(call.body.input) === JSON.stringify(node.messages)));
  assert(calls.every(call => call.url.endsWith('/responses/input_tokens')));
});
