const { readFileSync } = require('node:fs');
const { performance } = require('node:perf_hooks');
const { isDeepStrictEqual, parseArgs } = require('node:util');
const { MODEL, countTokens, meta, validateFiles } = require('../../api/_meta');
const jd = require('../../api/_organize');
const { proposeSemantic } = require('../../api/_semantic-analysis');
const { normalizeContext } = require('../../api/_semantic-context');
const {
  compileRuntime, semanticCase, EXECUTION_TOKEN_BUDGET, OUTPUT_RESERVE
} = require('../../api/_semantic-runtime');
const { simulateJD } = require('../../api/_simulation');

const REQUIRED_FILES = [
  '_core.txt', '_core_jd_request_context.txt', 'rules_m2_recruitment_viewer.txt'
];
const APPLICANT_CONTEXT = {
  jd_viewer_open: true,
  jd_viewer_status: 'PUBLISHED',
  jd_published_viewer_active_tab: 'applicants',
  entity_domain_hint: 'candidate'
};

// Keep these authored expectations out of every optimizer request and context brief.
const HOLDOUT = [
  {
    id: 'H01',
    query: 'Alex Example',
    context: APPLICANT_CONTEXT,
    expected: 'view_published_jd_applicant',
    field: 'applicant_name_query',
    value: 'Alex Example',
    state: { selectedApplicant: 'applicant-fixture-1', attendees: [], leaveFormOpen: false }
  },
  {
    id: 'H02',
    query: 'Alex Example',
    context: { ...APPLICANT_CONTEXT, interview_workflow_phase: 'awaiting_attendee_names' },
    expected: 'interview_scheduling',
    field: 'attendee_name_query',
    value: 'Alex Example',
    state: { selectedApplicant: null, attendees: ['Alex Example'], leaveFormOpen: false }
  },
  {
    id: 'H03',
    query: 'Dismiss this evaluation panel, please',
    context: { ...APPLICANT_CONTEXT, jd_evaluation_results_modal_open: true },
    expected: 'close_published_jd_applicant_evaluation_results',
    state: { evaluationOpen: false, jdOpen: true, leaveFormOpen: false }
  },
  {
    id: 'H04',
    query: 'Switch to leave and start a new leave request',
    context: APPLICANT_CONTEXT,
    expected: 'apply_leave',
    state: { workspace: 'leave', leaveFormOpen: true, selectedApplicant: null }
  }
].map(test => ({ ...test, intent: 'jd-viewer' }));

const elapsed = start => Math.round(performance.now() - start);
const sum = (items, value) => items.reduce((total, item) => total + (value(item) || 0), 0);
const groupCounts = items => items.reduce((counts, item) => {
  counts[item] = (counts[item] || 0) + 1;
  return counts;
}, {});

function summarizeUsage(receipts) {
  const usage = {};
  for (const [name, get] of [
    ['inputTokens', item => item.prompt_tokens],
    ['outputTokens', item => item.completion_tokens],
    ['totalTokens', item => item.total_tokens],
    ['reasoningTokens', item => item.completion_tokens_details?.reasoning_tokens],
    ['cachedInputTokens', item => item.prompt_tokens_details?.cached_tokens]
  ]) {
    const observed = receipts.map(get).filter(value => Number.isSafeInteger(value) && value >= 0);
    usage[name] = observed.length ? sum(observed, value => value) : null;
  }
  return usage;
}

function readRequest(path) {
  let input;
  try {
    input = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw Error('The private request file must be readable JSON.');
  }
  const files = validateFiles(input?.files);
  const names = files.map(file => file.name.split('/').at(-1)).sort();
  if (!isDeepStrictEqual(names, [...REQUIRED_FILES].sort())) {
    throw Error('Provide exactly the three named UIC files from the handoff.');
  }
  const context = normalizeContext(input, files);
  if (context.projectContext && context.projectContext.status !== 'approved') {
    throw Error('Supply an approved projectContext for the context comparison, or omit it.');
  }
  const supplied = Boolean(context.projectContext || context.promptContext.length);
  return {
    files,
    withContext: supplied ? { projectContext: input.projectContext, promptContext: input.promptContext } : null
  };
}

function analysisMetrics(analysis, milliseconds) {
  const calls = analysis.semantic.calls;
  const attempted = calls.filter(call => !['budget-skipped', 'cached'].includes(call.status));
  return {
    rules: analysis.rules.length,
    modules: Object.keys(analysis.modules).length,
    relations: analysis.semantic.relations.length,
    pendingRemovals: analysis.semantic.removalProposals.length,
    reviewItems: analysis.semantic.reviewItems.length,
    sourceCodeUnits: analysis.coverage.sourceChars,
    retainedCodeUnits: analysis.coverage.retainedChars,
    extractedCodeUnits: analysis.coverage.extractedChars,
    providerAttempts: attempted.length,
    callStatuses: groupCounts(calls.map(call => call.status)),
    attemptsWithoutUsage: attempted.filter(call => !Object.keys(call.usage || {}).length).length,
    milliseconds,
    usage: summarizeUsage(attempted.map(call => call.usage || {}))
  };
}

function makeLegacyVariant(files, analysis, mode) {
  return {
    name: mode === 'baseline' ? 'original-full' : 'legacy-heuristic',
    request: test => ({ messages: jd.classifyMessages(files, analysis, test, mode) })
  };
}

async function makeSemanticVariant(files, name, context, { live, warm }) {
  const options = {
    ...(live ? {} : { limits: { maxCalls: 0 } }),
    ...(warm ? { cacheScope: 'private-uic-local-comparison', cache: new Map() } : {})
  };
  const start = performance.now();
  const analysis = await proposeSemantic(files, context, options);
  const cold = analysisMetrics(analysis, elapsed(start));
  if (!live && cold.providerAttempts) throw Error('Structural evaluation attempted a provider call.');

  let warmMetrics = null;
  if (warm) {
    const warmStart = performance.now();
    const repeated = await proposeSemantic(files, context, options);
    warmMetrics = analysisMetrics(repeated, elapsed(warmStart));
    warmMetrics.sameSnapshot = repeated.sha256 === analysis.sha256;
  }

  const plan = compileRuntime(analysis);
  return {
    name,
    optimization: { cold, warm: warmMetrics },
    request: test => semanticCase(files, analysis, {
      mode: 'candidate',
      executionContext: test.context,
      utterance: test.query,
      intent: test.intent,
      plan
    })
  };
}

function assertBehavior(test, value) {
  const simulation = simulateJD(test, value);
  const fieldMatches = !test.field || value.entities?.[test.field] === test.value;
  const stateMatches = Object.entries(test.state || {}).every(([key, expected]) =>
    isDeepStrictEqual(simulation.finalState[key], expected)
  );
  return {
    pass: value.intent === test.expected && fieldMatches && stateMatches && simulation.passed,
    rejectedToolAttempts: simulation.invalidAttempts
  };
}

async function assess(variant, test, live) {
  const start = performance.now();
  const { messages, selection } = variant.request(test);
  const result = {
    id: test.id,
    tier: selection?.tier || null,
    serializedRequestBytes: messages ? Buffer.byteLength(JSON.stringify(messages)) : null,
    fallbackExpansions: selection?.fallbackExpansions || 0,
    sizingCalls: 0,
    generationCalls: 0,
    usage: {}
  };
  if (!messages) return { ...result, status: 'unresolved', milliseconds: elapsed(start) };
  if (!live) return { ...result, status: 'structural-only', milliseconds: elapsed(start) };

  result.sizingCalls = 1;
  const sizingStart = performance.now();
  try {
    result.sizedInputTokens = await countTokens(messages);
  } catch {
    return {
      ...result, status: 'sizing-provider-error',
      sizingMilliseconds: elapsed(sizingStart), milliseconds: elapsed(start)
    };
  }
  result.sizingMilliseconds = elapsed(sizingStart);
  if (result.sizedInputTokens + OUTPUT_RESERVE > EXECUTION_TOKEN_BUDGET) {
    return { ...result, status: 'budget-skipped', milliseconds: elapsed(start) };
  }

  result.generationCalls = 1;
  const generationStart = performance.now();
  let outcome;
  try {
    const response = await meta(messages, OUTPUT_RESERVE, { reasoningEffort: 'minimal' });
    result.usage = response.usage;
    if (!response.value || typeof response.value.intent !== 'string') {
      outcome = { status: 'incomplete' };
    } else {
      outcome = { status: 'completed', ...assertBehavior(test, response.value) };
    }
  } catch (error) {
    result.usage = error.providerUsage || {};
    outcome = { status: error.providerUsage || error.status === 504 ? 'incomplete' : 'generation-provider-error' };
  }
  return {
    ...result, ...outcome,
    generationMilliseconds: elapsed(generationStart), milliseconds: elapsed(start)
  };
}

function summarizeCases(cases) {
  const completed = cases.filter(item => item.status === 'completed');
  const generated = cases.filter(item => item.generationCalls);
  const requests = cases.filter(item => item.serializedRequestBytes !== null);
  const sized = cases.filter(item => Number.isSafeInteger(item.sizedInputTokens));
  return {
    cases: cases.length,
    statuses: groupCounts(cases.map(item => item.status)),
    passed: completed.length ? completed.filter(item => item.pass).length : null,
    failedCases: completed.filter(item => !item.pass).map(item => item.id),
    unevaluatedCases: cases.filter(item => item.status !== 'completed').map(item => item.id),
    rejectedToolAttempts: completed.length ? sum(completed, item => item.rejectedToolAttempts) : null,
    fallbackCases: cases.filter(item => item.fallbackExpansions).length,
    fallbackExpansions: sum(cases, item => item.fallbackExpansions),
    contextTiers: groupCounts(cases.flatMap(item => item.tier ? [item.tier] : [])),
    serializedRequests: requests.length,
    serializedRequestBytes: requests.length ? sum(requests, item => item.serializedRequestBytes) : null,
    sizingCalls: sum(cases, item => item.sizingCalls),
    sizedInputTokens: sized.length ? sum(sized, item => item.sizedInputTokens) : null,
    generationCalls: generated.length,
    generationAttemptsWithoutUsage: generated.filter(item => !Object.keys(item.usage).length).length,
    latencyMs: {
      total: sum(cases, item => item.milliseconds),
      sizing: sum(cases, item => item.sizingMilliseconds),
      generation: sum(cases, item => item.generationMilliseconds)
    },
    usage: summarizeUsage(generated.map(item => item.usage))
  };
}

function tokenBreakEven(variant, baseline) {
  const suites = ['development', 'holdout'];
  const allPassed = result => suites.every(suite =>
    result[suite].passed === result[suite].cases &&
    result[suite].generationAttemptsWithoutUsage === 0 &&
    Number.isSafeInteger(result[suite].usage.totalTokens)
  );
  const setup = variant.optimization?.cold;
  if (!setup || setup.attemptsWithoutUsage || !Number.isSafeInteger(setup.usage?.totalTokens) ||
      !allPassed(variant) || !allPassed(baseline)) return null;
  const requests = sum(suites, suite => baseline[suite].cases);
  const saved = sum(suites, suite => baseline[suite].usage.totalTokens - variant[suite].usage.totalTokens);
  if (saved <= 0) return null;
  return {
    basis: 'provider-reported token volume across passing cases, without pricing',
    coldOptimizationTokens: setup.usage.totalTokens,
    tokensSavedAcrossSuite: saved,
    estimatedRequests: Math.ceil(setup.usage.totalTokens * requests / saved)
  };
}

async function run({ request, live, warm, 'with-original': withOriginal }) {
  const { files, withContext } = readRequest(request);
  const legacyStart = performance.now();
  const legacy = jd.organize(files);
  const legacyMetrics = {
    rules: legacy.rules.length, modules: Object.keys(legacy.modules).length,
    providerAttempts: 0, milliseconds: elapsed(legacyStart)
  };
  const variants = [
    { ...makeLegacyVariant(files, legacy, 'candidate'), optimization: { cold: legacyMetrics, warm: null } },
    await makeSemanticVariant(files, 'semantic-source-only', {}, { live, warm })
  ];
  if (withContext) variants.push(await makeSemanticVariant(files, 'semantic-with-context', withContext, { live, warm }));
  if (withOriginal) variants.push(makeLegacyVariant(files, legacy, 'baseline'));

  const suites = { development: jd.CASES, holdout: HOLDOUT };
  const results = new Map(variants.map(variant => [variant.name, { development: [], holdout: [] }]));
  let first = 0;
  for (const [suite, tests] of Object.entries(suites)) {
    for (const test of tests) {
      // Rotate arm order so provider prefix caching does not always favor the same arm.
      for (let offset = 0; offset < variants.length; offset++) {
        const variant = variants[(first + offset) % variants.length];
        results.get(variant.name)[suite].push(await assess(variant, test, live));
      }
      first = (first + 1) % variants.length;
    }
  }

  const summaries = variants.map(variant => ({
    name: variant.name,
    optimization: variant.optimization || null,
    ...Object.fromEntries(Object.entries(results.get(variant.name)).map(([suite, cases]) =>
      [suite, summarizeCases(cases)]
    ))
  }));
  return {
    evaluation: live ? 'live-meta-standard' : 'structural-only-no-provider',
    execution: { model: MODEL, reasoningEffort: 'minimal', outputCap: OUTPUT_RESERVE },
    sourceFiles: files.length,
    contextComparison: withContext ? 'included' : 'skipped-no-context-supplied',
    variants: summaries.map(variant => ({
      ...variant,
      ...(variant.name.startsWith('semantic-') ? { tokenBreakEven: tokenBreakEven(variant, summaries[0]) } : {})
    }))
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      request: { type: 'string' },
      structural: { type: 'boolean' },
      live: { type: 'boolean' },
      warm: { type: 'boolean' },
      'with-original': { type: 'boolean' }
    }
  });
  if (!values.request || Boolean(values.live) === Boolean(values.structural) || (values.warm && !values.live)) {
    throw Error('Usage: node tests/backend/evaluate-uic.cjs --request PRIVATE.json (--structural | --live [--warm]) [--with-original]');
  }
  if (values.live && !process.env.promptimizer_musespark && !process.env.META_API_KEY) {
    throw Error('Live mode requires the configured Meta credential in the local environment.');
  }
  console.log(JSON.stringify(await run(values), null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.publicMessage || error.message);
    process.exitCode = 1;
  });
}
