const { readFileSync, writeFileSync } = require('node:fs');
const { parseArgs } = require('node:util');
const { performance } = require('node:perf_hooks');
const { validateFiles } = require('../../api/_meta');
const { proposeSemantic } = require('../../api/_semantic-analysis');
const fixture = require('./fixtures/observatory.json');
const { createProvider } = require('./observatory-provider.cjs');

async function main() {
  const { values } = parseArgs({
    options: {
      'with-context': { type: 'boolean' },
      live: { type: 'boolean' },
      request: { type: 'string' },
      output: { type: 'string' }
    }
  });
  if (values.live && !process.env.promptimizer_musespark && !process.env.META_API_KEY) {
    throw Error('Configure the existing Meta credential in the local environment before using --live.');
  }
  const input = values.request ? JSON.parse(readFileSync(values.request, 'utf8')) : fixture;
  const files = validateFiles(input.files);
  const body = values['with-context'] ? input : { files };
  const provider = values.live ? undefined : createProvider().provider;
  const startedAt = performance.now();
  const analysis = await proposeSemantic(files, body, { provider });
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (values.output) {
    writeFileSync(values.output, JSON.stringify(analysis, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  const summary = {
    evaluation: values.live ? 'live' : 'mock',
    contextIncluded: Boolean(body.projectContext || body.promptContext),
    snapshot: analysis.sha256,
    model: analysis.model,
    elapsedMs,
    rules: analysis.rules.length,
    modules: Object.keys(analysis.modules).length,
    relations: analysis.semantic.relations.length,
    pendingRemovals: analysis.semantic.removalProposals.length,
    reviewItems: analysis.semantic.reviewItems.length,
    usage: analysis.usage
  };
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => {
  console.error(error.publicMessage || error.message);
  process.exitCode = 1;
});
