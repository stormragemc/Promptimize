module.exports = String.raw`"""Promptimize semantic runtime v1. Standard library only."""
import json
import re
import hashlib
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / 'runtime.json').read_text(encoding='utf-8'))


def hydrate_module_text():
    if PLAN.get('textSource') is None:
        return  # Compatibility with earlier self-contained semantic exports.
    if PLAN['textSource'] != 'module-files-v1':
        raise RuntimeError('Unsupported instruction text source. Export a new reviewed candidate.')
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('snapshot') != PLAN.get('snapshot') or set(manifest.get('modules', {})) != set(PLAN['modules']):
        raise RuntimeError('Manifest and runtime snapshot differ. Export a new reviewed candidate.')
    texts = {}
    marker = re.compile(r'^<!-- promptimize-rule:(R[0-9]+) -->\n', re.M)
    for module, expected_ids in PLAN['modules'].items():
        path = (ROOT / manifest['modules'][module]).resolve()
        if not path.is_relative_to(ROOT.resolve()):
            raise RuntimeError('A prompt module path leaves the export directory.')
        try:
            raw_bytes = path.read_bytes()
        except OSError as exc:
            raise RuntimeError('A prompt module is missing. Export a new reviewed candidate.') from exc
        if hashlib.sha256(raw_bytes).hexdigest() != PLAN.get('moduleHashes', {}).get(module):
            raise RuntimeError('A prompt module changed after review. Save the correction in Promptimize Review, freeze a new candidate and export again.')
        raw = raw_bytes.decode('utf-8')
        matches = list(marker.finditer(raw))
        if [match[1] for match in matches] != expected_ids:
            raise RuntimeError('Prompt rule markers differ from the frozen runtime.')
        for index, match in enumerate(matches):
            end = matches[index + 1].start() - 2 if index + 1 < len(matches) else len(raw)
            text = raw[match.end():end]
            rule_id = match[1]
            if rule_id in texts and texts[rule_id] != text:
                raise RuntimeError('Copies of a shared prompt rule disagree. Export a new reviewed candidate.')
            texts[rule_id] = text
    for rule in PLAN['rules']:
        if rule['id'] == rule['activeId']:
            if rule['id'] not in texts:
                raise RuntimeError('An active prompt rule is missing from the module files.')
            rule['text'] = texts[rule['id']]


hydrate_module_text()
MAX_CONTEXT_CHARS = 50000
JD_ADAPTER = 'jd-viewer-v1'
OPTIONAL_JD_STATE = {'jd_evaluation_results_modal_open': False, 'candidate_information_modal_open': False,
                     'interview_workflow_phase': None}
STOP_WORDS = set('a an and are as at be by for from has have i in is it me my of on or that the this to was we with you your'.split())


def unique(values):
    return list(dict.fromkeys(values))


def terms(text):
    matches = re.findall(r'[a-z0-9][a-z0-9_-]*', text.lower())
    return unique(part for word in matches for part in [word, *re.split(r'[_-]', word)]
                  if len(part) > 1 and part not in STOP_WORDS)


def read_field(state, name):
    value = state
    for key in name.split('.'):
        if isinstance(value, dict) and key in value:
            value = value[key]
        elif isinstance(value, list) and re.fullmatch(r'0|[1-9][0-9]*', key) and int(key) < len(value):
            value = value[int(key)]
        elif isinstance(value, list) and key == 'length':
            value = len(value)
        else:
            return False, None
    return True, value


def same_scalar(first, second):
    if type(first) in (int, float) and type(second) in (int, float):
        return first == second
    return type(first) is type(second) and not isinstance(first, (dict, list)) and first == second


def condition_result(conditions, state):
    missing = []
    for condition in conditions:
        present, value = read_field(state, condition['field'])
        op = condition['op']
        if op in ('present', 'absent'):
            if present != (op == 'present'):
                return False, []
        else:
            has_default = (PLAN['adapter'] == JD_ADAPTER and state.get('jd_viewer_open') is True
                           and condition['field'] in OPTIONAL_JD_STATE)
            if not present and not has_default:
                missing.append(condition['field'])
            elif same_scalar(value if present else OPTIONAL_JD_STATE[condition['field']], condition.get('value')) != (op == 'eq'):
                return False, []
    return (None if missing else True), missing


def add_reason(reasons, code, detail):
    item = {'code': code, 'detail': detail}
    if item not in reasons:
        reasons.append(item)


def request_modules(state, intent):
    return unique(value for value in (intent, state.get('workflow'), state.get('subworkflow'), state.get('intent'))
                  if isinstance(value, str) and value)


def legacy_jd_terms(state):
    if state.get('jd_evaluation_results_modal_open') is True:
        return ['jd_evaluation_results_modal_open', 'evaluation']
    if state.get('candidate_information_modal_open') is True:
        return ['candidate_information_modal_open', 'candidate_information']
    phase = state.get('interview_workflow_phase')
    if isinstance(phase, str) and phase:
        return ['interview_workflow_phase', phase]
    if state.get('jd_published_viewer_active_tab') == 'applicants':
        return ['jd_published_viewer_active_tab', 'applicants']
    return []


def matches_assignment(assignment, requested):
    workflow = assignment.get('workflow', 'undefined')
    subworkflow = assignment.get('subworkflow', 'undefined')
    return any(name in (assignment.get('moduleId'), workflow, subworkflow,
                        str(workflow) + '/' + str(subworkflow), str(workflow) + '-' + str(subworkflow))
               for name in requested)


def relation_closure(seed, state, fallback_reasons, unresolved, known, record_missing_state=True):
    selected = dict.fromkeys(seed)
    queue = list(selected)
    edges = defaultdict(list)
    for edge in PLAN['relations']:
        source, target = edge['from'], edge['to']
        edges[source].append((target, edge['conditions']))
        if edge['type'] == 'overrides' and source != target:
            edges[target].append((source, edge['conditions']))
    for rule_id in queue:
        for target, conditions in edges[rule_id]:
            matches, missing = condition_result(conditions, state)
            if matches is False:
                continue
            if record_missing_state:
                for field in missing:
                    add_reason(fallback_reasons, 'missing-relation-state', field)
                    add_reason(unresolved, 'missing-relation-state', field)
            if target not in known:
                add_reason(fallback_reasons, 'missing-dependency', target)
                add_reason(unresolved, 'missing-dependency', target)
            elif target not in selected:
                selected[target] = None
                queue.append(target)
    return selected


def cycle_members(selected, state):
    outgoing = defaultdict(list)
    for edge in PLAN['relations']:
        source, target = edge['from'], edge['to']
        if source in selected and target in selected and condition_result(edge['conditions'], state)[0] is not False:
            outgoing[source].append(target)
    indexes, low_links = {}, {}
    stack, stacked, cycles = [], set(), set()

    def visit(rule_id):
        indexes[rule_id] = low_links[rule_id] = len(indexes)
        stack.append(rule_id)
        stacked.add(rule_id)
        for target in outgoing[rule_id]:
            if target not in indexes:
                visit(target)
                low_links[rule_id] = min(low_links[rule_id], low_links[target])
            elif target in stacked:
                low_links[rule_id] = min(low_links[rule_id], indexes[target])
        if low_links[rule_id] != indexes[rule_id]:
            return
        component = []
        while True:
            target = stack.pop()
            stacked.remove(target)
            component.append(target)
            if target == rule_id:
                break
        if len(component) > 1 or rule_id in outgoing[rule_id]:
            cycles.update(component)

    for rule_id in selected:
        if rule_id not in indexes:
            visit(rule_id)
    return cycles


def render_context(rules, broader):
    blocks = []
    if PLAN['brief']:
        blocks.append('Approved project routing brief (source instructions and approved rule corrections take precedence):\n' + PLAN['brief'])
    blocks.extend(rule['text'] for rule in rules)
    if broader:
        blocks.extend('Approved project reference [' + ref['id'] + '] ' + ref['title'] + ' (source instructions take precedence)\n' + ref['text']
                      for ref in PLAN['references'])
    return '\n\n'.join(blocks)


def check_conflicts(selected, fallback_reasons, unresolved):
    for conflict in PLAN.get('conflicts', []):
        kind, rule_ids = conflict['type'], conflict['ruleIds']
        if kind == 'contradiction':
            relevant = len(rule_ids) > 1 and all(rule_id in selected for rule_id in rule_ids)
        else:
            relevant = not rule_ids or any(rule_id in selected for rule_id in rule_ids)
        if relevant:
            detail = ','.join(rule_ids) or 'project-context'
            add_reason(fallback_reasons, kind, detail)
            add_reason(unresolved, kind, detail)


def check_selected_state(selected, state, fallback_reasons, unresolved):
    for rule in PLAN['rules']:
        if rule['activeId'] not in selected:
            continue
        _, missing = condition_result(rule['conditions'], state)
        fields = list(missing)
        assignments = [item for item in rule['assignments'] if item.get('status') != 'unresolved']
        placements = [condition_result(item['conditions'], state) for item in assignments]
        if 'shared' not in rule['workflows'] and placements and not any(status is True for status, _ in placements):
            fields.extend(field for _, missing_fields in placements for field in missing_fields)
        for field in unique(fields):
            add_reason(fallback_reasons, 'missing-rule-state', field)
            add_reason(unresolved, 'missing-rule-state', field)


def select_context(context, utterance='', intent=None, require_rule_ids=None, max_context_chars=MAX_CONTEXT_CHARS):
    if PLAN.get('runtimeVersion') != 1:
        raise RuntimeError('Unsupported semantic runtime version.')
    if not isinstance(context, dict):
        raise RuntimeError('Execution context must be an object.')
    if type(max_context_chars) is not int or not 1 <= max_context_chars <= MAX_CONTEXT_CHARS:
        raise RuntimeError('Invalid context character limit.')
    state = context
    fallback_reasons, unresolved = [], []
    active_rules = [rule for rule in PLAN['rules'] if rule['id'] == rule['activeId']]
    known = {rule['id'] for rule in active_rules}
    requested = request_modules(state, intent)
    seed = dict.fromkeys(PLAN['modules'].get('shared', []))
    anchored = False
    conditional = {}
    excluded = set()
    for rule in PLAN['rules']:
        result, missing = condition_result(rule['conditions'], state)
        conditional[rule['id']] = result
        assignments = [item for item in rule['assignments'] if item.get('status') != 'unresolved']
        eligible_assignments = [condition_result(item['conditions'], state) for item in assignments]
        all_placements_guarded = assignments and 'shared' not in rule['workflows'] and all(
            any(item.get('moduleId') == workflow for item in assignments) for workflow in rule['workflows'])
        if result is False or (all_placements_guarded and all(status is False for status, _ in eligible_assignments)):
            excluded.add(rule['id'])
        direct_assignments = []
        for item, (status, fields) in zip(assignments, eligible_assignments):
            if matches_assignment(item, requested) or (item['conditions'] and status is True):
                direct_assignments.append((status, fields))
        direct_module = any(workflow != 'shared' and workflow in requested for workflow in rule['workflows'])
        direct_module = direct_module and not any(matches_assignment(item, requested) for item in assignments)
        matched_assignment = any(status is True for status, _ in direct_assignments)
        direct = direct_module or matched_assignment or (bool(rule['conditions']) and result is True)
        if direct and rule['id'] not in excluded:
            seed[rule['activeId']] = None
            if result is True:
                anchored = True
        all_assignment_state_missing = bool(direct_assignments) and all(status is None for status, _ in direct_assignments)
        if (direct and result is None) or (all_assignment_state_missing and result is not False):
            for field in unique([*missing, *(field for _, fields in direct_assignments for field in fields)]):
                add_reason(fallback_reasons, 'missing-rule-state', field)
                add_reason(unresolved, 'missing-rule-state', field)

    state_terms = legacy_jd_terms(state) if PLAN['adapter'] == JD_ADAPTER else []
    query_terms = terms(utterance)
    frequencies = Counter(term for rule in PLAN['rules'] for term in rule['terms'])
    ranked = []
    for index, rule in enumerate(PLAN['rules']):
        if rule['id'] in excluded:
            continue
        words = set(rule['terms'])
        named_intent = any(name.lower() in query_terms or name in requested for name in rule['intents'])
        state_hits = sum(term in words for term in state_terms)
        hits = [term for term in query_terms if term in words]
        rare = sum(frequencies[term] * 2 <= len(PLAN['rules']) for term in hits)
        score = (60 if named_intent else 0) + 20 * state_hits + 4 * rare + len(hits)
        if score >= 5:
            ranked.append((-score, index, rule['activeId']))
    ranked_ids = set()
    for _, _, rule_id in sorted(ranked):
        if rule_id in ranked_ids:
            continue
        ranked_ids.add(rule_id)
        seed[rule_id] = None
        anchored = True
        if len(ranked_ids) == 8:
            break
    for rule_id in require_rule_ids or []:
        active = PLAN['ruleAliases'].get(rule_id, rule_id)
        if active in known:
            seed[active] = None
            anchored = True
        else:
            add_reason(fallback_reasons, 'missing-required-rule', rule_id)
            add_reason(unresolved, 'missing-required-rule', rule_id)

    if PLAN['adapter'] == JD_ADAPTER and state.get('interview_workflow_phase') == 'awaiting_attendee_names':
        phase_evidence = [rule for rule in PLAN['rules'] if conditional[rule['id']] is not False and (
            'awaiting_attendee_names' in rule['terms'] or any(
                condition['field'] == 'interview_workflow_phase' and condition['op'] == 'eq'
                and condition.get('value') == 'awaiting_attendee_names' for condition in rule['conditions']
            ))]
        if not phase_evidence:
            add_reason(fallback_reasons, 'missing-phase-evidence', 'interview_workflow_phase')
            add_reason(unresolved, 'missing-phase-evidence', 'interview_workflow_phase')
        for rule in phase_evidence:
            seed[rule['activeId']] = None
    if not anchored:
        add_reason(fallback_reasons, 'no-narrow-match', 'request workflow or source rule')
    selected = relation_closure(seed, state, fallback_reasons, unresolved, known)
    check_selected_state(selected, state, fallback_reasons, unresolved)
    check_conflicts(selected, fallback_reasons, unresolved)
    if fallback_reasons:
        selected = relation_closure((rule['id'] for rule in active_rules), state, fallback_reasons, unresolved, known, not anchored)
        check_selected_state(selected, state, fallback_reasons, unresolved)
        check_conflicts(selected, fallback_reasons, unresolved)
    rules = [rule for rule in active_rules if rule['id'] in selected]
    cycles = cycle_members(selected, state)
    text = render_context(rules, bool(fallback_reasons))
    length = len(text.encode('utf-16-le', errors='surrogatepass')) // 2
    if not rules:
        add_reason(unresolved, 'missing-source', 'no retained instructions')
    if length > max_context_chars:
        add_reason(unresolved, 'context-budget-exceeded', str(max_context_chars))
    return {
        'status': 'unresolved' if unresolved else 'ready',
        'tier': 'broader' if fallback_reasons else 'compact',
        'fallbackExpansions': 1 if fallback_reasons else 0,
        'fallbackReasons': fallback_reasons,
        'unresolved': unresolved,
        'cycles': [rule['id'] for rule in rules if rule['id'] in cycles],
        'ruleIds': [rule['id'] for rule in rules],
        'modules': [name for name, ids in PLAN['modules'].items() if any(rule_id in selected for rule_id in ids)],
        'contextCharacters': length,
        'text': '' if unresolved else text,
    }


def load_context(context, utterance='', intent=None):
    result = select_context(context, utterance, intent)
    if result['status'] != 'ready':
        raise RuntimeError(json.dumps({key: value for key, value in result.items() if key != 'text'}))
    return result['text']


def runtime_request(context, utterance, baseline=False, intent=None, require_rule_ids=None):
    if PLAN.get('runtimeVersion') != 1:
        raise RuntimeError('Unsupported semantic runtime version.')
    result = {}
    if baseline:
        text = (ROOT / 'baseline.md').read_bytes().decode('utf-8')
    else:
        selection = select_context(context, utterance, intent, require_rule_ids)
        result['selection'] = {key: value for key, value in selection.items() if key != 'text'}
        if selection['status'] != 'ready':
            return result
        text = selection['text']
    envelope = json.dumps({'request_context': context, 'utterance': utterance}, ensure_ascii=False, separators=(',', ':'))
    if PLAN['adapter'] == JD_ADAPTER:
        developer = 'Classify the HR assistant request using the following instructions. Return JSON only: {"intent":"canonical intent name","entities":{}}. Preserve canonical entity field names. Do not execute HR actions.\n\n' + text
        user = envelope
    elif PLAN['adapter'] == 'sample':
        developer = 'You are an event operations assistant. Follow only these promptbase instructions:\n' + text + '\n\nReturn JSON only: {"action":"eligible|ineligible|lookup_event_status|ask_event_id|ask_confirmation|show_profile|cancel_booking|save_profile|escalate","event_id":"string or empty"}. A lookup action asks for a simulated tool result; do not infer its result. Never claim a side effect happened when no tool ran.'
        user = envelope if context else utterance
    else:
        developer = 'Follow these promptbase instructions. Return a JSON object. Do not execute side effects.\n\n' + text
        user = envelope
    result['messages'] = [{'role': 'developer', 'content': developer}, {'role': 'user', 'content': user}]
    return result


if __name__ == '__main__':
    import sys
    state = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    utterance = sys.argv[2] if len(sys.argv) > 2 else ''
    intent = sys.argv[3] if len(sys.argv) > 3 else None
    print(load_context(state, utterance, intent))
`;
