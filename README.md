# Promptimize

An evidence-first prototype for refactoring overloaded promptbases. It shows source-linked rules, constructs a workflow-scoped candidate using the exact quoted wording, and compares bounded synthetic cases against the original context. Muse Spark 1.3 extracts the rule candidates and runs the cases.

## Build stages (Singapore time, 4 November 2026)

| Stage | Target | Review checkpoint |
| --- | --- | --- |
| 1. Foundation | 11:30 PM | Live Vercel preview, Meta key recognized server-side, synthetic sample loads. |
| 2. Audit | 1:00 AM | Muse extracts rules with literal source quotes and file/line evidence; invalid quotes fail closed. |
| 3. Candidate | 2:30 AM | Shared and workflow modules, route view, approved mapping, exportable JSON. |
| 4. Evaluation | 4:30 AM | Same cases on all-context baseline and scoped candidate; simulated lookup, actual provider token usage, failures captured as next-iteration notes. |
| 5. Morning handoff | 9:00 AM | Deployed link, test instructions, measured sample results, known limitations. |

After 9 AM: inspect Marcel's feedback; extend the adapter to a **small, selected portion** of the supplied UIC archive locally, keep that code private, improve evidence review and cost estimation, polish responsive layout, record the judge demo, and freeze by 8 PM. No employer code belongs in the public repository or public demo.

## Try it

1. Open the deployed Vercel preview and click **Load the sample**.
2. Click **Analyze bundle**. This makes one Meta Model API call. Review source quotes and workflow tags; approve only if they match the source.
3. Open **Candidate** and inspect the before/after loading map. Download the JSON if useful.
4. Open **Tests** and click **Run comparisons**. This runs six synthetic cases on both versions, with up to two responses for each run that requests a lookup. It makes up to 14 more Meta responses.
5. Check task pass counts and actual provider-reported total tokens. A candidate failure is a next-iteration note, never an automatic patch.

The first implementation is an honest narrow slice: it accepts 1–12 text files with a 50,000-character cap for experimental analysis of the same three-workflow domain, asks a human to review model-extracted rules, and measures one stochastic run per case **only for the bundled sample**. The UI does **not** claim production correctness, exact dollar cost, generalized arbitrary-repo migration, or statistical significance. Export includes a Markdown promptbase and JSON snapshot; a runnable loader and zip export are later stages.

## Local development

Static assets are at the root. `api/` contains Vercel Node functions. The server expects `promptimizer_musespark` (the exact environment variable configured on the connected Vercel project), with `META_API_KEY` as a conventional fallback. Keep either key server-side and never prefix it with `NEXT_PUBLIC_`. No dependencies, database, or account setup are required. `vercel dev` serves the local app after linking to the project and configuring a development key. The Vercel Preview/Production secret does not automatically appear in a local terminal.

## Safety and evaluation limits

- Sources are sent to Meta only when Analyze is clicked. Test execution is opt-in.
- A quoted rule is accepted only if it occurs verbatim in the named source file. This validates provenance, **not** the model's interpretation or completeness.
- The candidate reuses exact source wording. Multi-workflow dependencies still require review and may fail tests.
- The run route allows only six synthetic test IDs and a one-step simulated event-status lookup. It has no production side-effect tools.
- The token comparison includes the baseline/candidate task calls and the simulated lookup follow-up, but **does not yet include the one-time analysis call or real routing/classification**, and it is not a projected bill. Provider pricing and caching are not modeled. Do not quote a cost-saving percentage from this graph.
- Model outputs can vary. One pass/fail per case is a debugging signal, not a reliability guarantee. The baseline can be wrong too.
- The browser holds the candidate and traces in session storage for the synthetic sample; the bundled sample resumes within the same tab session. Download JSON for a durable record.

## Morning handoff checkpoints

At 9 AM, test the synthetic path in order: Input → Audit → Candidate → Tests → Export. Approve the visual direction and review workflow before expanding to the UIC slice. The initial checkpoint includes literal source evidence, a SHA-256 snapshot record, token sizing before generation, bounded simulated tools, measured task usage, next-iteration findings, and Markdown/JSON downloads.

Remaining work after your review: 9–11 AM fix usability and contract issues; 11 AM–2 PM adapt one selected UIC workflow privately; 2–4 PM validate its rules and tests and produce a runnable loader; 4–6 PM run final comparisons and record the demo; 6–8 PM freeze and submit/showcase. These are planning targets, not a claim that work runs unattended after a conversation ends.

### Recorded calibration finding

A small live runtime probe (a manually assembled two-rule candidate, not the full generated candidate) asked for an event ID when the test expected refund eligibility. That probe exposed incomplete scenario inputs and an ambiguity between informational eligibility and a transaction. Suite v2 supplies event IDs explicitly. No generated candidate was patched in response. Human review is still required to approve the expected behavior.

`node test-contract.cjs` checks source provenance, snapshot change rejection, scoped assembly, the one-lookup execution limit, and usage aggregation with a mock provider. Live checks verified Meta authentication and the full sample audit (16 literal source-linked rules). Full six-case live evaluation remains a user-triggered checkpoint.

Token preflight uses Meta's context sizing endpoint with representative requests. The reserve includes 14 output caps and estimated lookup overhead, with a 30,000-token allowance; this is not an exact bill or a dollar budget. A candidate with no projected initial-input reduction is blocked. The candidate snapshot is checked again on each task request.

## UIC JD-viewer adapter (4 November update)

Choose the original folder or the three specific files `_core.txt`, `_core_jd_request_context.txt`, and `rules_m2_recruitment_viewer.txt`. Folder selection automatically limits this adapter to those three names. The public repository contains the adapter and synthetic tests, not employer content.

The adapter splits blank-line sections and individual canonical intent definitions. It preserves every source block, assigns uncertain blocks to shared context, and consolidates only literal duplicates. The selected real input produced 52 blocks in 10 modules. An initial parser incorrectly treated many intent definitions as one block; a regression test now covers that boundary. Tests verified all non-whitespace source characters remain represented. The ZIP contains workflow/subworkflow prompt files, intent indexes, a source map, snapshot manifest, report, and a runnable Python loader.

Four authored classification cases cover evaluation tabs, closing the evaluation modal, candidate information tabs, and applicant selection over stale leave state. Routing uses request UI state, never the expected answer. Baseline loads all three sources; candidate uses the same module order as the exported loader. Unknown UI state falls back to all modules. Actual UIC behavioral equivalence and token savings require live model runs; offline character reductions are not token results. No production HR tools are invoked.

The UIC adapter does not call an LLM to rewrite rules. Muse Spark runs the before/after classification tests. Integration with the missing original Gateway composer/classifier remains explicit future work. This is a supported migration adapter, not arbitrary program understanding.

Token delta colors: negative = green (fewer task-run tokens), positive = red, zero = neutral. Quality failures independently block the recommendation.

Run `node test-jd-adapter.cjs` and `node test-contract.cjs`. Real-source tests and private generated outputs were kept outside the public repository.

## Proposal and correction review

The flow is now Input → Audit → Proposal → Review → Candidate → Tests. Proposal presents two folder diagrams: the source layout and the planned export. Folder labels in the proposed tree are editable. Saving a parent folder renames every affected output path, and the manifest and exported loader follow those paths. Collisions, unsafe paths, and a file being reused as a folder are rejected.

Review keeps each original source quote and permits an explicit candidate-text correction and module reassignment. Every source rule must remain assigned somewhere. Saved corrections create a new fingerprint including paths and review metadata. Candidate execution and exports use the corrected text; baseline execution continues to use the original files. Review notes and original quotes are included in the ZIP.

After Save corrections, Approve & freeze unlocks Candidate. A frozen candidate's Proposal and Review are read-only. Create next proposal explicitly preserves the old snapshot and results in iteration history, then opens an editable proposal. The JSON download includes that history. Changes are held in the current browser state; the synthetic sample session can restore, and real uploads should be downloaded to preserve a record.

`node test-review.cjs` verifies renamed folders in manifests/exports, original-source retention, corrected candidate assembly, assignment changes, invalid paths, collision rejection, and isolation of the prior snapshot. A private real-file test renamed recruitment → talent-workflows and evaluation → results-review and successfully ran the exported Python loader from the renamed ZIP.

## Runnable bundle and visual tool regression (latest)

Candidate now has Prepare runnable bundle. This validates exported rule sections, relative paths, loader/runner inclusion, baseline and fixtures without generating model output. Download and Tests unlock after it succeeds. The ZIP includes a Python standard-library `run.py` Meta client with explicit input sizing, per-call allowance and no retries. `--dry-run` assembles a request locally without a key or API call. Candidate and baseline modes are documented inside the bundle. Rule markers are stripped by the loader, which deduplicates by source rule ID; the supported Python request payloads were checked against Node for all six real-input fixture contexts, including a corrected rule assigned to multiple modules.

The JD-viewer suite now contains six authored cases, adding the interview-attendee exception and explicit leave switching. New analyses include the expanded suite; existing frozen snapshots keep their saved cases. Tests still require a human to review the expectations and are not exhaustive. No production tools are connected.

`api/_simulation.js` applies each recorded model intent/action to a fresh deterministic fixture. It records the initial state, intent, adapter-dispatched tool arguments, acceptance/rejection, resulting state and assertions. A rejected action stays visible and counts as a failure; a blocked tool is not treated as proof of correct model behavior. For JD classification, the adapter dispatches the tool from the model's intent. These are not native model tool-call traces. The event sample retains its bounded lookup loop.

View trace and Open visual comparison show a fullscreen native dialog with old/new skeletal workspaces, context modules, reported tokens/latency, step playback, tool timelines, source references, expected outputs, assertions and a final-state diff. The same overlay can show completed sides while other requests are pending. Replay is local and sends no additional model requests. The UI never fabricates a pending answer or exposes private reasoning.

Readiness colors and enabled buttons mark the required sequence. Frozen candidates remain unchanged by evaluation. Run `node test-simulation.cjs` with the prior test commands. Offline tests pass for valid transitions, invalid-tool rejection, state isolation, modal-only close, exports, review revisions and loader parity. Full live six-case Meta evaluation and authenticated browser screenshot QA still require verification.


## Stages 4 and 5: reviewed regression and complete measurements

The follow-up workbench supports separately approved test plans, optional holdout cases, 1–3 repetitions, per-rule evidence links, bounded per-attempt reservations and complete reported call receipts. It includes optimizer overhead, explicit retries, incomplete-call usage, cache/reasoning details, latency and pricing-based cost estimates. Unknown cost evidence or behavioral failures prevent an adoption recommendation.

See [the stages 4–5 review guide](docs/STAGES_4_5_REVIEW.md) for the exact UI sequence, supported simulation boundaries, API fields and remaining live acceptance gate. Stage 6 motion and the Forma showcase are available for owner review; production remains unchanged.


## Forma before/after showcase

Open `/demo/?version=before`, `/demo/?version=after`, or `/demo/bench.html`. Both apps use identical UI/backend code; only the original versus frozen exported prompt package/loader differs. The fictional fixture has 26,871 source characters; Promptimize generated 12 modules with meaningful intent/policy registries. No private UIC source is included.

A real Vercel cloud benchmark completed 32 calls: 16/16 checks passed in each version, all paired final states matched, total task tokens fell 58.5% and estimated task cost fell 51.9%. Median model latency was 1.100s before and 1.156s after, so no speedup is claimed. The complete evidence, prior failed attempts and method are in `demo/generated/`; see [the showcase guide](docs/FORMA_SHOWCASE.md).

Normal preview builds run only `node demo/package-apps.cjs` to produce both standalone ZIPs and the exported promptbase ZIP. Live cloud benchmarking requires the separately explicit `node demo/cloud-benchmark.cjs --run-live` command and the existing server-side Meta credential. No browser or laptop is required for it. Do not run it automatically on normal deploys.
