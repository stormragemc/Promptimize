# Stages 4 and 5 review

The approved backend PR was merged to main as `73967fb98d34263ca1a3fc77bcb758d5175ae83f`. This follow-up implements stage 4 (real regression testing) and stage 5 (complete measurements) on `feature/regression-measurements`. Stage 6, final delivery and showcase preparation, is deliberately deferred for owner review.

## Browser review sequence

1. Open the feature branch Preview and start a fresh analysis. Use the synthetic sample first, then the authorized UIC slice.
2. Follow Audit → Proposal → Review → approve/freeze → prepare the runnable bundle → Tests.
3. Click **Build test plan**. This is deterministic and makes no model calls.
4. Inspect each selected request, expected action, entity/state assertions and original rule references. Development cases are selected by default. Reserved holdout cases are available but not selected automatically. Open the case JSON to correct a fixture or its source rule links. Add a case if needed. Every selected case needs existing source rule IDs.
5. Select 1–3 runs per case and an explicit test token allowance. Repeated runs need a larger allowance; the maximum is 300,000. Click **Approve selected cases**. The exact suite gets its own fingerprint, bound to the candidate and original files.
6. Check the token budget. The server sizes every selected baseline/candidate request, multiplies by repetitions and reserves bounded output and lookup overhead. No test answers are generated here. Requests needing missing state, requests exceeding the 20,000-token per-call allowance, nonreducing input or an oversized suite block execution.
7. Run comparisons. Each side and repetition gets its own receipt. Completed results remain. An incomplete response pauses the run; an explicit Resume retries only unfinished sides and retains prior usage. Unknown/in-flight responses retain a conservative reservation and cannot produce verified cost savings.
8. Replay a recorded trace. Playback makes no provider calls. Download the test evidence, or export a ZIP containing `test-plan.json`, `measurements.json` and the reviewed `cases.json` alongside the promptbase.
9. On a failed expectation, inspect both original and candidate results. **Create next proposal** carries investigation observations and rule references into editable review notes. It does not add a prompt guardrail, change rules or clear failures automatically.

The existing white/pink/violet interface is preserved. This stage adds test-plan controls and a measurement breakdown within Tests; it does not redesign the app. Project/prompt context forms and semantic-conflict controls remain outside these two stages.

## What the tests mean

The JD suite includes six established development cases and four reserved holdout scenarios: name-only applicant selection, name-only interview attendee selection, a modal-close paraphrase and an explicit workflow switch. The event suite includes six development cases and three reserved cases for the refund boundary/exception/missing-identifier rules. Owner-authored cases can edit state and assertions within these supported simulations.

The JD fixture has one synthetic applicant, Alex Example. The supported dispatch intents are evaluation navigation/close, candidate-information navigation, applicant selection, attendee selection and explicit leave switching. Tests do not call a real HR system. Other production intents need new supported fixture adapters rather than invented outcomes.

Rule coverage is declared by the reviewer, not inferred from instructions merely appearing in a loaded context. A rule reference does not establish exhaustive behavioral coverage. Repetitions expose variability; ten authored scenarios are not a production reliability estimate. Once holdouts have influenced changes, they must not be described as untouched.

## Measurement scope and decisions

Every new execution receipt records model, stage, reported input/output/total tokens, reported cached/reasoning details, sizing, generation and local retrieval time, context tier, fallback expansion and tool attempts. Both calls in the bounded event-status lookup are included. Incomplete calls keep available usage. No automatic provider retries occur. Explicit retries count toward spend and the remaining allowance. The optimizer receipts retain extraction/comparison activity and local cache hits separately.

Local metadata routing and context expansion use zero provider calls. Their selected context is counted in the classification call's input. Rejected tool attempts remain failures. Simulated tools have no real external-service charges. This accounts for the implemented supported path; it cannot measure the missing production Gateway composer, external tool fees or an unknown application's orchestration.

USD estimates use provider-reported token categories and Meta Standard prices verified on 4 November 2026: input $1.25, cached input $0.15 and output $4.25 per million tokens. Source: https://dev.meta.ai/docs/pricing-rate-limits . Cached input is subtracted from ordinary input before pricing. Reasoning is already included in output and is not charged twice. Missing cache counts use the ordinary input rate. Estimates are not invoices. Unknown usage or an unsupported model blocks a verified cost decision and break-even estimate.

The report separates current-plan task cost, one-time optimizer cost, experiment total, retries, local fallback counts, declared coverage and median/p95 observed latency. Earlier plans remain in the evidence download, not silently overwritten. Old results with another candidate or test-plan fingerprint cannot satisfy current correctness. Lower cost is never enough when a reviewed expectation fails. Baseline failures also require inspection of the original behavior or test oracle.

Budget reservations are conservative, per-plan admission controls coordinated by the single workbench run and rechecked for each server request. They are not an account-wide or cross-tab billing cap. Model accounting may differ from initial sizing. The optimizer has its separate existing call/token reservation limits; the displayed test allowance does not retroactively include optimizer work already completed.

## Implementation contract

| Endpoint | Input | Result |
| --- | --- | --- |
| `POST /api/evaluation-plan` | `files`, `analysis`; optional `action:"approve"`, `plan` | Draft or approved versioned plan plus declared coverage |
| `POST /api/evaluation-preflight` | `files`, `analysis`, approved `plan` | All sized requests, reservations, unresolved cases and `canRun` |
| `POST /api/evaluation-case` | `files`, `analysis`, approved `plan`, `caseId`, `repetition`, `mode`, `remainingTokens` | Decision, simulation, assertions, investigation hints and complete call receipts |
| `POST /api/export` | Existing fields plus optional approved `plan` | Existing bundle plus reviewed cases, plan and metrics |

Existing callers and frozen backend artifacts remain supported. The tested legacy Python exporter now uses exactly the same instruction order and newline content as Node, including reviewed multiline corrections. Exported sample cases select their intent-specific context instead of accidentally loading every module. Prompt file hashes detect changes after review.

## Verification and remaining gate

Run `node --test tests/backend/*.test.cjs` and the four root legacy suites. The functional UI test uses a DOM and provider double to exercise approval, repeated comparisons, receipts, replay and next-proposal carry-forwards. It is not a screenshot or a live Meta model benchmark.

The private three-file UIC slice was processed offline: 52 original heuristic rules, ten modules, ten available cases and six selected development cases. All twelve original/candidate requests assembled by exported Python matched Node byte-for-byte. Zero model calls were made for that check; no employer content was committed.

Live Meta accuracy, cost savings and latency remain unverified from this agent because the local Meta credential and authenticated protected Preview POST are unavailable. The owner can start those bounded calls from the authenticated Preview. Visual QA, final demo recording and final delivery are stage 6 and have not been started. Do not merge or proceed to stage 6 until the owner reviews this branch.


## Follow-up UI review: finish, allowance warnings and matching traces

After every selected old/new run completes, the app opens **Here you go!** with ZIP, Markdown, candidate JSON and test-evidence downloads. Failed or cost-unverified runs retain clear review messaging. Incomplete runs stay on Tests. Upload another clears the current project/sample session and returns to the top/input section.

A required reserve above the allocation opens a native blocking warning dialog. Closing it does not unlock an insufficient run. The dialog offers editing cases/repetitions/allowance and requires reapproval and sizing of the changed plan. A fitting reserve using at least 90% of the allocation gets a near-limit warning with explicit continuation. For example, 44,548 of 45,000 fits with 452 headroom and must not be described as a shortfall. Exhausted retry allowance also opens the warning before another generation call. No amount is silently increased.

A dismissible **Hooray! Same final state.** banner appears above a trace only at the final frame, with both completed results passing their reviewed checks, current candidate/plan bindings and matching nonempty complete final states. Equal failed states do not celebrate. Dismissal and replay make no model calls; reduced-motion preferences are respected.

The continuation handoff was saved before implementing these changes so a fresh account can resume safely. The current published branch remains the source of truth if that handoff's checkpoint is older. Roadmap stage 6 still awaits the owner's UI instructions.
