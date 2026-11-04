const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const { proposeSemantic } = require('../../api/_semantic-analysis');
const { compileRuntime, selectContext } = require('../../api/_semantic-runtime');
const { identifyConflicts, conflictId } = require('../../api/_semantic-conflicts');
const { digest, validateAnalysis } = require('../../api/_bundle');
const { revise } = require('../../api/_review');
const { bundleFiles } = require('../../api/_export');
const classifyCase = require('../../api/classify-case');
const fixture = require('./fixtures/observatory.json');
const { createProvider } = require('./observatory-provider.cjs');

async function guardedAnalysis({ assignmentOnly = false } = {}) {
 const files = [
  { name: 'refunds.md', content: 'When phase is approval, approve the refund. Never approve in another phase.\r\n' },
  { name: 'reports.md', content: 'Record the audit timestamp after generating an inventory report. 🗂️\n' }
 ];
 const provider = async messages => ({ value: {
  rules: JSON.parse(messages[1].content).sections.map((section, index) => {
   const conditions = section.file === 'refunds.md' ? [{ field: 'phase', op: 'eq', value: 'approval' }] : [];
   return {
    key: 'rule-' + index, startSectionId: section.id, actor: 'agent', scope: section.file,
    action: section.text, conditions: assignmentOnly ? [] : conditions,
    assignments: [{ workflow: section.file === 'refunds.md' ? 'refund' : 'inventory',
     conditions: assignmentOnly ? conditions : [], rationale: 'Explicit source policy.' }]
   };
  }), relations: [], reviewItems: []
 }, usage: {} });
 const analysis = await proposeSemantic(files, {}, { provider, limits: { maxPairs: 0 } });
 return { files, analysis, plan: compileRuntime(analysis) };
}

function materialize(output) {
 const directory = mkdtempSync(join(tmpdir(), 'promptimize-safety-'));
 for (const [name, content] of Object.entries(output)) {
  const path = join(directory, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
 }
 return directory;
}

function assertMissingPhase(result) {
 assert.equal(result.status, 'unresolved');
 assert.equal(result.text, '');
 assert(result.unresolved.some(item => item.code === 'missing-rule-state' && item.detail === 'phase'));
}

test('lexical, explicit, shared and dependency selection cannot bypass missing rule state', async () => {
 const { plan } = await guardedAnalysis();
 const guarded = plan.rules.find(rule => rule.conditions.length);
 const report = plan.rules.find(rule => !rule.conditions.length);
 assertMissingPhase(selectContext(plan, { utterance: 'approve refund' }));
 assertMissingPhase(selectContext(plan, { requireRuleIds: [guarded.id] }));
 assertMissingPhase(selectContext({ ...plan, modules: { ...plan.modules, shared: [guarded.id] } }, { utterance: 'inventory report' }));
 assertMissingPhase(selectContext({ ...plan, relations: [{ type: 'requires', from: report.id, to: guarded.id, conditions: [] }] }, { utterance: 'inventory report' }));
 assertMissingPhase(selectContext(plan));
 const valid = selectContext(plan, { executionContext: { phase: 'approval' }, utterance: 'approve refund' });
 assert.equal(valid.status, 'ready');
 assert.equal(valid.tier, 'compact');
});

test('lexically selected assignment guards also require state', async () => {
 const { plan } = await guardedAnalysis({ assignmentOnly: true });
 assertMissingPhase(selectContext(plan, { utterance: 'approve refund' }));
 assert.equal(selectContext(plan, { executionContext: { phase: 'approval' }, utterance: 'approve refund' }).status, 'ready');
});

test('Node and exported Python agree on missing-state refusals and exact CRLF/Unicode text', async () => {
 const { files, analysis, plan } = await guardedAnalysis();
 const directory = materialize(bundleFiles(analysis, [], files));
 try {
  for (const request of [
   { executionContext: {}, utterance: 'approve refund' },
   { executionContext: {}, utterance: 'inventory report', requireRuleIds: ['R1'] },
   { executionContext: { phase: 'approval' }, utterance: 'approve refund' },
   { executionContext: { phase: 'intake' }, utterance: 'approve refund' }
  ]) {
   const actual = JSON.parse(execFileSync('python3', ['-c',
    'import json,sys\nfrom loader import select_context\nq=json.load(sys.stdin)\nprint(json.dumps(select_context(q["executionContext"],q["utterance"],require_rule_ids=q.get("requireRuleIds"))))'
   ], { cwd: directory, input: JSON.stringify(request), encoding: 'utf8' }));
   assert.deepEqual(actual, selectContext(plan, request));
  }
 } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a missing required rule state stops the API before sizing or generation', async t => {
 const files = [
  { name: '_core.txt', content: 'Never invent permissions.' },
  { name: '_core_jd_request_context.txt', content: 'Use the current viewer.' },
  { name: 'rules_m2_recruitment_viewer.txt', content: 'When authorization is approved, navigate the facial evaluation tab.' }
 ];
 const provider = async messages => ({ value: {
  rules: JSON.parse(messages[1].content).sections.map((section, index) => ({
   key: 'rule-' + index, startSectionId: section.id, actor: 'agent', scope: 'viewer',
   conditions: section.file === 'rules_m2_recruitment_viewer.txt' ? [{ field: 'authorization', op: 'eq', value: 'approved' }] : [],
   assignments: [{ workflow: 'shared', rationale: 'This source is a viewer prerequisite.' }]
  })), relations: [], reviewItems: []
 }, usage: {} });
 const analysis = await proposeSemantic(files, {}, { provider, limits: { maxPairs: 0 } });
 let fetches = 0;
 t.mock.method(globalThis, 'fetch', async () => { fetches++; throw Error('Unexpected provider call'); });
 const response = { status(code) { this.code = code; return this; }, setHeader() { return this; }, json(data) { this.data = data; } };
 await classifyCase({ method: 'POST', body: { files, analysis, mode: 'candidate', test: { id: 'U01' } } }, response);
 assert.equal(response.code, 200);
 assert.equal(response.data.status, 'incomplete');
 assert.equal(response.data.pass, null);
 assert.equal(fetches, 0);
});

async function contradictoryAnalysis(type = 'contradiction') {
 const analysis = await proposeSemantic(fixture.files, fixture, { provider: createProvider().provider });
 const rules = [
  analysis.rules.find(rule => rule.quote.includes('35 km/h or more')),
  analysis.rules.find(rule => rule.quote.includes('Before issuing a badge'))
 ];
 const item = identifyConflicts([{ type, ruleIds: rules.map(rule => rule.id),
  evidence: rules.flatMap(rule => rule.sources.map(source => source.id)), rationale: 'Fixture review finding.' }])[0];
 analysis.semantic.reviewItems.push(item);
 analysis.sha256 = digest(fixture.files, analysis);
 validateAnalysis(analysis, fixture.files);
 const resolution = { conflictId: item.id, action: 'dismiss-false-positive',
  evidence: item.evidence, rationale: 'The two instructions address different actors and actions; both remain retained.' };
 return { analysis, rules, item, resolution };
}

test('conflicts require explicit source-backed review and retain original findings', async () => {
 const { analysis, rules, item, resolution } = await contradictoryAnalysis();
 const request = { requireRuleIds: rules.map(rule => rule.id) };
 const notesOnly = revise(fixture.files, analysis, { notes: 'Looks resolved.' });
 assert.equal(selectContext(compileRuntime(notesOnly), request).status, 'unresolved');
 const reviewed = revise(fixture.files, analysis, { conflictResolutions: [resolution] });
 assert.equal(selectContext(compileRuntime(reviewed), request).status, 'ready');
 assert(reviewed.semantic.reviewItems.some(entry => entry.id === item.id));
 assert.equal(analysis.semantic.conflictResolutions, undefined);
 assert.notEqual(reviewed.sha256, analysis.sha256);
 assert.equal(reviewed.rules.find(rule => rule.id === rules[0].id).quote, rules[0].quote);
});

test('corrected-candidate resolutions require a correction and expire after affected edits', async () => {
 const { analysis, rules, resolution } = await contradictoryAnalysis();
 const corrected = { ...resolution, action: 'corrected-candidate', rationale: 'Reviewed the explicit scope correction against the source.' };
 assert.throws(() => revise(fixture.files, analysis, { conflictResolutions: [corrected] }), /must include an explicit/);
 const reviewed = revise(fixture.files, analysis, {
  text: { [rules[0].id]: rules[0].quote + '\nThis applies to dome operations.' }, conflictResolutions: [corrected]
 });
 const request = { requireRuleIds: rules.map(rule => rule.id) };
 assert.equal(selectContext(compileRuntime(reviewed), request).status, 'ready');
 const path = rules[0].workflows[0];
 const renamed = revise(fixture.files, reviewed, { paths: { [path]: 'workflows/reviewed/safety/prompt.md' } });
 assert.equal(selectContext(compileRuntime(renamed), request).status, 'ready');
 const changed = revise(fixture.files, reviewed, { text: { [rules[0].id]: rules[0].quote + '\nA different unreviewed correction.' } });
 assert.equal(selectContext(compileRuntime(changed), request).status, 'unresolved');
});

test('unknown resolutions, unsupported evidence and project-context overrides are rejected', async () => {
 const { analysis, resolution } = await contradictoryAnalysis();
 for (const entries of [
  [{ ...resolution, conflictId: 'unknown' }], [resolution, resolution],
  [{ ...resolution, evidence: ['invented'] }], [{ ...resolution, rationale: '' }]
 ]) assert.throws(() => revise(fixture.files, analysis, { conflictResolutions: entries }));
 const { analysis: context, item } = await contradictoryAnalysis('context-conflict');
 assert.throws(() => revise(fixture.files, context, { conflictResolutions: [{ ...resolution, conflictId: conflictId(item) }] }), /context version/);
});

test('resolutions also work for dependency review findings and survive export parity', async () => {
 const { analysis, rules, resolution } = await contradictoryAnalysis('relation-unresolved');
 const reviewed = revise(fixture.files, analysis, { conflictResolutions: [resolution] });
 const request = { requireRuleIds: rules.map(rule => rule.id) };
 const node = selectContext(compileRuntime(reviewed), request);
 assert.equal(node.status, 'ready');
 const directory = materialize(bundleFiles(reviewed, [], fixture.files));
 try {
  const python = JSON.parse(execFileSync('python3', ['-c',
   'import json\nfrom loader import select_context\nprint(json.dumps(select_context({},require_rule_ids=' + JSON.stringify(request.requireRuleIds) + ')))'
  ], { cwd: directory, encoding: 'utf8' }));
  assert.deepEqual(python, node);
 } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('export refuses edited or missing actual prompt files before generation', async () => {
 const { files, analysis } = await guardedAnalysis();
 const output = bundleFiles(analysis, [], files);
 const runtime = JSON.parse(output['runtime.json']);
 assert(runtime.rules.every(rule => !Object.hasOwn(rule, 'text')));
 const modulePath = analysis.paths[analysis.rules[0].workflows[0]];
 const directory = materialize(output);
 try {
  writeFileSync(join(directory, modulePath), output[modulePath] + '\nUnreviewed change.');
  let run = spawnSync('python3', ['run.py', '--dry-run', '--utterance', 'approve refund'], { cwd: directory, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /changed after review/);
  rmSync(join(directory, modulePath));
  run = spawnSync('python3', ['run.py', '--dry-run', '--utterance', 'approve refund'], { cwd: directory, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /module is missing/);
 } finally { rmSync(directory, { recursive: true, force: true }); }
});
