const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { proposeSemantic } = require('../../api/_semantic-analysis');
const { compileRuntime, selectContext, semanticCase } = require('../../api/_semantic-runtime');
const { bundleFiles } = require('../../api/_export');
const { revise } = require('../../api/_review');
const fixture = require('./fixtures/observatory.json');
const cases = require('./fixtures/observatory-cases.json');
const { createProvider } = require('./observatory-provider.cjs');

async function makeAnalysis() {
  const { provider } = createProvider();
  return proposeSemantic(fixture.files, fixture, { provider });
}

function materialize(directory, output) {
  for (const [name, content] of Object.entries(output)) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

test('independent synthetic cases preserve phase overrides and required original behavior', async () => {
  const analysis = await makeAnalysis();
  const runtime = compileRuntime(analysis);
  for (const scenario of cases) {
    const request = { executionContext: scenario.context, utterance: scenario.query };
    const result = selectContext(runtime, request);
    if (scenario.id === 'OBS05') {
      assert.equal(result.status, 'unresolved');
      assert.equal(result.fallbackExpansions, 1);
      assert(result.unresolved.some(item => item.detail === 'deskPhase'));
      assert.equal(semanticCase(fixture.files, analysis, { ...request, mode: 'candidate' }).messages, undefined);
    } else {
      assert.equal(result.status, 'ready', scenario.id);
      assert.equal(result.tier, 'compact', scenario.id);
      for (const required of scenario.requiredText) assert(result.text.includes(required), scenario.id + ' missing ' + required);
      for (const forbidden of scenario.forbiddenText || []) assert(!result.text.includes(forbidden), scenario.id + ' retained ' + forbidden);
    }
    const selected = runtime.rules.filter(rule => result.ruleIds.includes(rule.id)).map(rule => rule.text).join('\n');
    for (const required of scenario.requiredText) assert(selected.includes(required), scenario.id + ' missing selected evidence');
  }
});

test('cycles co-load rules; a broken dependency or insufficient budget cannot start execution', async () => {
  const runtime = compileRuntime(await makeAnalysis());
  const original = runtime.rules.find(rule => rule.text.includes('Select the matching observation target'));
  const confirmation = runtime.rules.find(rule => rule.text.includes('30 seconds'));
  const request = {
    executionContext: { deskPhase: 'target-selection' },
    utterance: 'Arden Vale'
  };
  const cyclic = {
    ...runtime,
    relations: [...runtime.relations, { type: 'requires', from: confirmation.id, to: original.id, conditions: [] }]
  };
  const selected = selectContext(cyclic, request);
  assert.equal(selected.status, 'ready');
  assert.deepEqual(new Set(selected.cycles), new Set([original.id, confirmation.id]));
  const missing = selectContext({
    ...runtime,
    relations: [...runtime.relations, { type: 'requires', from: original.id, to: 'R9000', conditions: [] }]
  }, request);
  assert.equal(missing.status, 'unresolved');
  assert.equal(missing.fallbackExpansions, 1);
  assert(missing.unresolved.some(item => item.code === 'missing-dependency' && item.detail === 'R9000'));
  assert.equal(missing.text, '');
  const budget = selectContext(runtime, { ...request, maxContextChars: 32 });
  assert.equal(budget.status, 'unresolved');
  assert(budget.unresolved.some(item => item.code === 'context-budget-exceeded'));
  assert.equal(budget.text, '');
});

test('exported Python and Node select the same rules and construct identical requests', async () => {
  const proposed = await makeAnalysis();
  const pending = proposed.semantic.removalProposals[0];
  const wind = proposed.rules.find(rule => rule.quote.includes('35 km/h or more'));
  const renamed = wind.workflows.find(name => name !== 'shared');
  const analysis = revise(fixture.files, proposed, {
    approvedRemovalIds: [pending.id],
    paths: { [renamed]: 'workflows/renamed/interlock/prompt.md' },
    text: { [wind.id]: wind.quote + '\nKeep the observatory log available.' }
  });
  const output = bundleFiles(analysis, [], fixture.files);
  const runtime = compileRuntime(analysis);
  assert.deepEqual(JSON.parse(output['runtime.json']), JSON.parse(JSON.stringify(runtime)));
  assert.equal(JSON.parse(output['manifest.json']).modules[renamed], 'workflows/renamed/interlock/prompt.md');
  assert(output['workflows/renamed/interlock/prompt.md'].includes('Keep the observatory log available.'));
  assert.equal(runtime.ruleAliases[pending.removeRuleId], pending.keepRuleId);
  const directory = mkdtempSync(join(tmpdir(), 'promptimize-runtime-'));
  try {
    materialize(directory, output);
    for (const scenario of cases) {
      const request = { executionContext: scenario.context, utterance: scenario.query };
      const python = JSON.parse(execFileSync('python3', [
        '-c', 'import json, sys\nfrom loader import select_context\nq = json.load(sys.stdin)\nprint(json.dumps(select_context(q["executionContext"], q["utterance"])))'
      ], { cwd: directory, input: JSON.stringify(request), encoding: 'utf8' }));
      assert.deepEqual(python, selectContext(runtime, request), scenario.id);
      if (python.status !== 'ready') continue;
      const context = join(directory, 'request-context.json');
      writeFileSync(context, JSON.stringify(scenario.context));
      for (const mode of ['baseline', 'candidate']) {
        const dryRun = JSON.parse(execFileSync('python3', [
          'run.py', '--dry-run', '--mode', mode, '--context', context, '--utterance', scenario.query
        ], { cwd: directory, encoding: 'utf8' }));
        const node = semanticCase(fixture.files, analysis, { ...request, mode });
        assert.deepEqual(dryRun.messages, node.messages, scenario.id + ' ' + mode);
        assert.equal(dryRun.generation_started, false);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
