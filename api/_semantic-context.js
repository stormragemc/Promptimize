const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const MAX_CONTEXT_BYTES = 40000;
const MAX_BRIEF_BYTES = 2400;
const AUTHORITIES = new Set(['user-approved', 'source-observed', 'inferred']);
const sha256 = value => createHash('sha256').update(value).digest('hex');

function stableStringify(value) {
 return JSON.stringify(value, (_key, child) => {
  if (!child || typeof child !== 'object' || Array.isArray(child)) return child;
  return Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]]));
 });
}

function invalid(path, expectation) {
 const message = `${path} ${expectation}.`;
 return Object.assign(Error(message), { status: 400, statusCode: 400, publicMessage: message });
}

function record(value, path) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(path, 'must be an object');
 return value;
}

function version(value, path, fallback) {
 if (value === undefined && fallback !== undefined) return fallback;
 if (value !== SCHEMA_VERSION) throw invalid(path, `must be ${SCHEMA_VERSION}`);
 return value;
}

function string(value, path, limit = 500, optional = false) {
 if (value === undefined && optional) return undefined;
 if (typeof value !== 'string' || !value.trim() || value.length > limit) {
  throw invalid(path, `must be a nonempty string of at most ${limit} UTF-16 code units`);
 }
 return value.trim();
}

function array(value, path, normalize, limit = 32) {
 if (value === undefined) return [];
 if (!Array.isArray(value) || value.length > limit) throw invalid(path, `must be an array of at most ${limit} items`);
 return Array.from(value, (item, index) => normalize(item, `${path}[${index}]`));
}

function strings(value, path) {
 return array(value, path, (item, itemPath) => string(item, itemPath));
}

function authority(value, path, fallback) {
 const result = value === undefined ? fallback : value;
 if (!AUTHORITIES.has(result)) throw invalid(path, 'must be user-approved, source-observed, or inferred');
 return result;
}

function evidenceFacts(value, path, fallback, hasTitle = false) {
 return array(value, path, (item, itemPath) => {
  const entry = record(item, itemPath);
  return {
   id: string(entry.id, `${itemPath}.id`, 100),
   ...(hasTitle ? { title: string(entry.title, `${itemPath}.title`, 200) } : {}),
   text: string(entry.text, `${itemPath}.text`, hasTitle ? 5000 : 1500),
   authority: authority(entry.authority, `${itemPath}.authority`, fallback)
  };
 });
}

function normalizeProject(projectContext) {
 if (projectContext == null) return null;
 const path = 'projectContext';
 const input = record(projectContext, path);
 if (input.status !== 'approved' && input.status !== 'draft') throw invalid(`${path}.status`, 'must be approved or draft');
 const defaultAuthority = authority(input.authority, `${path}.authority`, input.status === 'approved' ? 'user-approved' : 'inferred');
 return {
  schemaVersion: version(input.schemaVersion, `${path}.schemaVersion`),
  projectId: string(input.projectId, `${path}.projectId`, 100),
  version: string(input.version, `${path}.version`, 100),
  status: input.status,
  authority: defaultAuthority,
  purpose: string(input.purpose, `${path}.purpose`, 1500, true),
  actors: strings(input.actors, `${path}.actors`),
  glossary: array(input.glossary, `${path}.glossary`, (item, itemPath) => {
   const entry = record(item, itemPath);
   return {
    term: string(entry.term, `${itemPath}.term`, 100),
    meaning: string(entry.meaning, `${itemPath}.meaning`),
    authority: authority(entry.authority, `${itemPath}.authority`, defaultAuthority)
   };
  }),
  stateFields: strings(input.stateFields, `${path}.stateFields`),
  invariants: evidenceFacts(input.invariants, `${path}.invariants`, defaultAuthority),
  exceptions: evidenceFacts(input.exceptions, `${path}.exceptions`, defaultAuthority),
  examples: evidenceFacts(input.examples, `${path}.examples`, defaultAuthority),
  workflowHints: strings(input.workflowHints, `${path}.workflowHints`),
  tools: strings(input.tools, `${path}.tools`),
  outputs: strings(input.outputs, `${path}.outputs`),
  references: evidenceFacts(input.references, `${path}.references`, defaultAuthority, true)
 };
}

function normalizePrompts(promptContext, files) {
 const known = new Set(files.map(file => file.name));
 const seen = new Set();
 return array(promptContext, 'promptContext', (item, path) => {
  const input = record(item, path);
  string(input.sourceFile, `${path}.sourceFile`, 200);
  const sourceFile = input.sourceFile;
  if (!known.has(sourceFile)) throw invalid(`${path}.sourceFile`, 'must name one of the uploaded files');
  const component = string(input.component, `${path}.component`, 150, true);
  const key = JSON.stringify([sourceFile, component ?? null]);
  if (seen.has(key)) throw invalid(path, 'duplicates a source file and component');
  seen.add(key);
  return {
   schemaVersion: version(input.schemaVersion, `${path}.schemaVersion`, SCHEMA_VERSION),
   version: string(input.version, `${path}.version`, 100, true) ?? '1',
   sourceFile,
   component,
   authority: authority(input.authority, `${path}.authority`, 'inferred'),
   purpose: string(input.purpose, `${path}.purpose`, 1500, true),
   scope: string(input.scope, `${path}.scope`, 500, true),
   caller: string(input.caller, `${path}.caller`, 500, true),
   callers: strings(input.callers, `${path}.callers`),
   supportedIntents: strings(input.supportedIntents, `${path}.supportedIntents`),
   dependencies: strings(input.dependencies, `${path}.dependencies`),
   knownBugs: strings(input.knownBugs, `${path}.knownBugs`),
   knownExceptions: strings(input.knownExceptions, `${path}.knownExceptions`),
   expectedBehavior: strings(input.expectedBehavior, `${path}.expectedBehavior`)
  };
 }, 48);
}

function findContextConflicts(project) {
 if (!project) return [];
 const groups = [
  ['glossary', project.glossary, 'term', 'meaning'],
  ['invariants', project.invariants, 'id', 'text'],
  ['exceptions', project.exceptions, 'id', 'text'],
  ['examples', project.examples, 'id', 'text'],
  ['references', project.references, 'id', 'text']
 ];
 const conflicts = [];
 for (const [field, entries, identity, content] of groups) {
  const claims = new Map();
  for (const entry of entries) {
   const key = entry[identity];
   const previous = claims.get(key);
   if (!previous) claims.set(key, entry);
   else if (previous[content] !== entry[content]) {
    conflicts.push({ kind: 'context-conflict', field, key, claims: [previous, entry], status: 'pending' });
   }
  }
 }
 return conflicts;
}

function makeBrief(project, conflicts) {
 if (project?.status !== 'approved') return '';
 const lines = [];
 const eligible = (field, key, entry) => entry.authority === 'user-approved' &&
  !conflicts.some(conflict => conflict.field === field && conflict.key === key);

 if (project.authority === 'user-approved' && project.purpose) lines.push(`Purpose: ${project.purpose}`);
 for (const [field, label] of [['invariants', 'Invariant'], ['exceptions', 'Exception']]) {
  for (const item of project[field]) if (eligible(field, item.id, item)) lines.push(`${label} ${item.id}: ${item.text}`);
 }
 if (project.authority === 'user-approved') {
  for (const [field, label] of [['stateFields', 'State field'], ['workflowHints', 'Workflow'], ['actors', 'Actor'], ['tools', 'Tool'], ['outputs', 'Output']]) {
   for (const item of project[field]) lines.push(`${label}: ${item}`);
  }
 }
 for (const item of project.glossary) if (eligible('glossary', item.term, item)) lines.push(`Term ${item.term}: ${item.meaning}`);

 const brief = [];
 let remaining = MAX_BRIEF_BYTES;
 for (const line of lines) {
  const size = Buffer.byteLength(line) + (brief.length ? 1 : 0);
  if (size > remaining) continue;
  brief.push(line);
  remaining -= size;
 }
 return brief.join('\n');
}

function normalizeContext({ projectContext, promptContext } = {}, files = []) {
 const project = normalizeProject(projectContext);
 const prompts = normalizePrompts(promptContext, files);
 const serialized = stableStringify({ schemaVersion: SCHEMA_VERSION, projectContext: project, promptContext: prompts });
 if (Buffer.byteLength(serialized) > MAX_CONTEXT_BYTES) throw invalid('Combined context', `must be at most ${MAX_CONTEXT_BYTES} UTF-8 bytes`);
 const conflicts = findContextConflicts(project);
 const approvedReferences = project?.status === 'approved'
  ? project.references.filter(item => item.authority === 'user-approved' &&
    !conflicts.some(conflict => conflict.field === 'references' && conflict.key === item.id))
  : [];
 return {
  schemaVersion: SCHEMA_VERSION,
  projectContext: project,
  promptContext: prompts,
  brief: makeBrief(project, conflicts),
  references: [...new Map(approvedReferences.map(item => [item.id, item])).values()],
  conflicts,
  fingerprint: sha256(serialized),
  ...(!project ? {
   draft: {
    status: 'draft',
    authority: 'inferred',
    note: 'Project purpose, state semantics, and policies are unresolved until supported by source evidence or user approval.',
    sources: files.map(file => ({ sourceFile: file.name, authority: 'source-observed' }))
   }
  } : {})
 };
}

function linesOf(content) {
 const lines = [];
 for (const match of content.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
  if (!match[0]) continue;
  lines.push({ start: match.index, text: match[0].replace(/[\r\n]+$/, '') });
 }
 return lines;
}

function lineAt(lines, offset) {
 let low = 0;
 let high = lines.length;
 while (low + 1 < high) {
  const middle = Math.floor((low + high) / 2);
  if (lines[middle].start > offset) high = middle;
  else low = middle;
 }
 return low + 1;
}

function makeEvidence(file, start, end, lines = linesOf(file.content)) {
 const insideSurrogatePair = offset => offset > 0 && offset < file.content.length &&
  /[\uD800-\uDBFF]/.test(file.content[offset - 1]) && /[\uDC00-\uDFFF]/.test(file.content[offset]);
 if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > file.content.length || start >= end ||
  insideSurrogatePair(start) || insideSurrogatePair(end)) throw Error('Invalid UTF-16 evidence span');
 const quote = file.content.slice(start, end);
 const hash = sha256(quote);
 return {
  id: `S-${sha256(stableStringify([file.name, start, end, hash])).slice(0, 24)}`,
  file: file.name,
  line: lineAt(lines, start),
  endLine: lineAt(lines, end - 1),
  start,
  end,
  quote,
  sha256: hash,
  hash
 };
}

const LIST_ITEM = /^( {0,3})(?:[-+*]|\d{1,9}[.)])\s+(\S.*)$/;
const CONTINUATION = /^(?:[*_]{1,2})?(?:unless|except|otherwise|however|provided that|only if)\b/i;

function textBoundaries(lines) {
 const boundaries = [{ start: 0, heading: '', kind: 'paragraph' }];
 let fence = null;
 let activeHeading = '';
 let headingLine = -1;
 let lastContentLine = -1;
 let lastText = '';
 let listIndent = null;
 const mark = (start, heading, kind) => {
  const current = boundaries.at(-1);
  if (current.start === start) Object.assign(current, { heading, kind });
  else boundaries.push({ start, heading, kind });
 };
 for (let index = 0; index < lines.length; index++) {
  const line = lines[index];
  const value = line.text;
  const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(value);
  if (fence) {
   if (delimiter?.[1][0] === fence[0] && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = null;
  } else if (delimiter) {
   fence = delimiter[1];
  } else {
   const atx = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*|\s*)$/.exec(value);
   const underline = index + 1 < lines.length && /^ {0,3}(?:={2,}|-{2,})\s*$/.test(lines[index + 1].text);
   const item = LIST_ITEM.exec(value);
   const setext = underline && value.trim() && !item && !/^ {0,3}(?:>|[-*_]{3,})/.test(value);
   const intent = /^ {0,3}-\s+intent_name\s*:\s*(\S.*)$/i.exec(value);
   if (atx || setext) {
    activeHeading = (atx?.[1] ?? value).trim();
    mark(line.start, activeHeading, 'heading');
    if (setext && !atx) index++;
    headingLine = index;
    listIndent = null;
   } else if (intent) {
    mark(line.start, intent[1].trim(), 'intent');
    listIndent = null;
   } else if (boundaries.at(-1).kind !== 'intent') {
    const separate = lastContentLine >= 0 && lastContentLine !== headingLine &&
     index > lastContentLine + 1 && !lastText.trimEnd().endsWith(':');
    if (item) {
     const indent = item[1].length;
     if ((listIndent === null ? separate : indent <= listIndent) && !CONTINUATION.test(item[2])) {
      mark(line.start, activeHeading, 'list');
     }
     listIndent = listIndent === null ? indent : Math.min(listIndent, indent);
    } else if (separate && value.trim() && !CONTINUATION.test(value.trimStart()) && !/^\s{2,}/.test(value)) {
     mark(line.start, activeHeading, 'paragraph');
     listIndent = null;
    }
   }
  }
  if (value.trim()) {
   lastText = value;
   lastContentLine = index;
  }
 }
 return boundaries;
}

const PYTHON_AST = [
 'import ast, json, sys',
 'source = sys.stdin.read()',
 'tree = ast.parse(source)',
 'def first_line(node):',
 '    return min([node.lineno] + [item.lineno for item in getattr(node, "decorator_list", [])])',
 'if len(tree.body) > 512: sys.exit(2)',
 'print(json.dumps([[first_line(node), type(node).__name__] for node in tree.body]))'
].join('\n');

function pythonBoundaries(file, lines) {
 const result = spawnSync('python3', ['-I', '-S', '-c', PYTHON_AST], {
  input: file.content,
  encoding: 'utf8',
  timeout: 1500,
  maxBuffer: 128000,
  env: { PATH: process.env.PATH ?? '', LC_ALL: 'C.UTF-8', PYTHONIOENCODING: 'utf-8' }
 });
 if (result.status !== 0 || result.error) return null;
 try {
  const boundaries = new Map([[0, { start: 0, heading: '', kind: 'python-ast' }]]);
  for (const [line, kind] of JSON.parse(result.stdout)) {
   const start = lines[line - 1]?.start;
   if (start === undefined) return null;
   boundaries.set(start, { start, heading: '', kind: `python-${kind}` });
  }
  return [...boundaries.values()].sort((a, b) => a.start - b.start);
 } catch {
  return null;
 }
}

function parseSources(files) {
 const sections = [];
 const diagnostics = [];
 for (const file of files) {
  if (!file.content.length) {
   diagnostics.push({ file: file.name, kind: 'empty-source' });
   continue;
  }
  const lines = linesOf(file.content);
  const extension = file.name.toLowerCase().split('.').at(-1);
  let boundaries;
  if (extension === 'md' || extension === 'txt') boundaries = textBoundaries(lines);
  else if (extension === 'py') {
   boundaries = pythonBoundaries(file, lines);
   if (!boundaries) diagnostics.push({ file: file.name, kind: 'retained-code', reason: 'Python AST unavailable, invalid, or over budget' });
  } else if (extension === 'json') {
   try {
    JSON.parse(file.content);
    boundaries = [{ start: 0, heading: '', kind: 'json' }];
   } catch {
    diagnostics.push({ file: file.name, kind: 'retained-data', reason: 'Invalid JSON structure' });
   }
  } else {
   diagnostics.push({ file: file.name, kind: 'retained-code', reason: 'No static parser configured for this file type' });
  }
  boundaries ??= [{ start: 0, heading: '', kind: 'retained' }];
  for (const [index, boundary] of boundaries.entries()) {
   const end = boundaries[index + 1]?.start ?? file.content.length;
   if (end > boundary.start) sections.push({
    ...makeEvidence(file, boundary.start, end, lines),
    heading: boundary.heading,
    kind: boundary.kind
   });
  }
 }
 return { sections, diagnostics };
}

module.exports = { normalizeContext, parseSources, makeEvidence, stableStringify, sha256 };
