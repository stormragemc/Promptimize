const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { makeEvidence, normalizeContext, parseSources } = require('../../api/_semantic-context');
const fixture = require('./fixtures/observatory.json');

test('approved, inferred and newer context fingerprints remain separate', () => {
  const approved = normalizeContext(fixture, fixture.files);
  const inferred = normalizeContext({}, fixture.files);
  const newer = normalizeContext({
    ...fixture,
    projectContext: { ...fixture.projectContext, version: 'night-shift-2' }
  }, fixture.files);
  assert.equal(approved.projectContext.status, 'approved');
  assert.equal(approved.promptContext[0].authority, 'user-approved');
  assert.equal(inferred.draft.status, 'draft');
  assert.equal(inferred.draft.authority, 'inferred');
  assert.equal(inferred.brief, '');
  assert.notEqual(approved.fingerprint, inferred.fingerprint);
  assert.notEqual(approved.fingerprint, newer.fingerprint);
  assert.equal(normalizeContext(fixture, fixture.files).fingerprint, approved.fingerprint);
  assert.throws(() => normalizeContext({
    ...fixture,
    projectContext: { ...fixture.projectContext, schemaVersion: 2 }
  }, fixture.files));
  assert.throws(() => normalizeContext({
    ...fixture,
    promptContext: [{ ...fixture.promptContext[0], sourceFile: 'missing.md' }]
  }, fixture.files));
});

test('original evidence uses exact UTF-16 offsets and a UTF-8 content hash', () => {
  const content = '🌒 before\r\nExact rule.\r\nAnother.';
  const file = { name: 'exact.md', content };
  const start = content.indexOf('Exact');
  const end = start + 'Exact rule.'.length;
  const evidence = makeEvidence(file, start, end);
  assert.equal(start, 11);
  assert.equal(evidence.line, 2);
  assert.equal(evidence.endLine, 2);
  assert.equal(evidence.start, start);
  assert.equal(evidence.end, end);
  assert.equal(evidence.quote, 'Exact rule.');
  assert.equal(evidence.sha256, createHash('sha256').update(evidence.quote).digest('hex'));
});

test('structural parsing preserves ordered original spans for every fixture file', () => {
  const { sections } = parseSources(fixture.files);
  for (const file of fixture.files) {
    const spans = sections.filter(section => section.file === file.name);
    assert(spans.length > 0, file.name);
    let at = 0;
    for (const section of spans) {
      assert(section.start >= at, file.name);
      assert.equal(file.content.slice(at, section.start).trim(), '', file.name);
      assert.equal(section.text ?? section.quote, file.content.slice(section.start, section.end), file.name);
      at = section.end;
    }
    assert.equal(file.content.slice(at).trim(), '', file.name);
  }
});

test('conflicting context facts remain pending and stay out of the approved brief', () => {
  const projectContext = {
    ...fixture.projectContext,
    invariants: [
      ...fixture.projectContext.invariants,
      { id: 'wind-gate', text: 'Allow opening in strong winds.', authority: 'user-approved' }
    ]
  };
  const result = normalizeContext({ ...fixture, projectContext }, fixture.files);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].status, 'pending');
  assert.equal(result.conflicts[0].key, 'wind-gate');
  assert(!result.brief.includes('wind-gate'));
  assert(!result.brief.includes('strong winds'));
});

test('Python source is parsed without executing a top-level write', () => {
  const directory = mkdtempSync(join(tmpdir(), 'promptimize-ast-'));
  try {
    const sentinel = join(directory, 'executed');
    const content = `from pathlib import Path
Path(${JSON.stringify(sentinel)}).touch()


def assemble():
    return ["commands.md"]
`;
    const parsed = parseSources([{ name: 'assembly.py', content }]);
    assert(!existsSync(sentinel));
    assert(parsed.sections.some(section => section.kind === 'python-FunctionDef'));
    assert.equal(parsed.sections.map(section => section.quote).join(''), content);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
