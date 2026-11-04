# Backend algorithm evaluation

This branch introduces a semantic proposal and runtime behind the explicit `algorithm: "semantic-v1"` selector. The default route remains the historical analysis. A behavior and cost comparison with real provider calls is required before enabling the selector in the workbench.

## Evidence from this branch

Run the existing contracts and the new backend suite from the repository root.

```sh
for test in test-contract.cjs test-jd-adapter.cjs test-review.cjs test-simulation.cjs; do
  node "$test" || exit
done
node --test tests/backend/*.test.cjs
node tests/backend/semantic-cli.cjs
node tests/backend/semantic-cli.cjs --with-context
```

**Results:** All four legacy suites and all 35 backend tests passed on Node 24.22.1 and Python 3.12.14. Both synthetic CLI examples completed with the provider double.

The existing suites cover provenance, snapshot integrity, path and assignment corrections, export layout, bounded lookup, and six isolated simulation cases. The semantic tests add UTF-16 source coverage, authority and version handling, grounded extraction, scoped comparison, pending and approved consolidation, graph closure, phase ambiguity, budget gating, and Node/Python request parity. Endpoint tests exercise the existing JSON traces and ZIP output with a provider double.

The fictional observatory fixture produced the following outputs. It has 1,357 source characters, 16 retained or extracted rules, seven modules, two relations, and one pending consolidation. The selected request is a name-only follow-up while roster collection is active.

| Analysis configuration | Optimizer activity | Reported usage by provider double | Selected context |
| --- | --- | --- | --- |
| Source only, cold | Four completed mock calls | 188 mock tokens, including 20 reasoning tokens | Nine rules, 772 characters |
| Source only, warm | Four local cache hits | No provider usage | Nine rules, 772 characters |
| Approved context, cold | Four completed mock calls | 188 mock tokens, including 20 reasoning tokens | Nine rules, 1,221 characters |
| Approved context, warm | Four local cache hits | No provider usage | Nine rules, 1,221 characters |

These are fixture and cache checks. The approved brief adds text in this case. The token values come from the provider double. The public HTTP path uses no cross-request optimizer cache because it has no verified project scope.

The selected private UIC input was checked locally for exact structural reconstruction and conservative source retention. The repository contains the evaluator and synthetic cases. Private sources, requests, and per-case outputs stay outside the repository.

## Live comparison and adoption gate

Use `tests/backend/evaluate-uic.cjs` to compare the legacy heuristic candidate, semantic source-only candidate, and semantic candidate with reviewed context. An optional fourth arm uses the original full prompt. Supply the three authorized files as `{files: [{name, content}]}` in a private JSON file. Supply versioned `projectContext` and optional `promptContext` in that same file for the reviewed-context arm. The evaluator leaves the reviewed arm out when an approved project brief is unavailable.

```sh
node tests/backend/evaluate-uic.cjs --request /path/to/private-uic.json --structural --with-original
node tests/backend/evaluate-uic.cjs --request /path/to/private-uic.json --live --with-original
```

The live command requires an authorized provider credential in the execution environment. Use only the approved three-file slice with Muse Spark Standard. The evaluator prints aggregate results and separates sizing, generation, optimizer calls, fallback, incomplete requests, and simulated assertion outcomes. `--warm` additionally exercises opt-in, run-scoped optimizer reuse. Keep the request and resulting reports private.

The six established cases form the development suite. Four independent holdout cases exercise phase-sensitive name resolution, a modal-close paraphrase, and an explicit workflow switch. The optimizer receives source and context. It does not receive holdout expectations. Runtime checks compare canonical intent, expected entity values, tool acceptance, and resulting state. Missing state or evidence and infrastructure errors are reported separately.

The acceptance gate is preservation of required behavior and zero critical permission or exception regressions. Measure provider-reported input, output, reasoning and cached tokens alongside end-to-end latency, fallback, and one-time refactor overhead. Use identical execution model settings for each arm. The runner computes a token-volume break-even only when usage is available, behavior passes and per-request savings are positive. It does not infer billed dollars from token volume.

**Live result for this branch:** Pending. The provider credential is configured on Vercel. This cloud environment could inspect the project and deployments, while authenticated POST to the protected Preview was unavailable. The structural and mock results above do not establish live accuracy, latency, token savings, or break-even.

## Frontend scope proof

The starting commit is `b98bc3f2baad72c13733552c7bcafedc747556b6`. From the branch head, run:

```sh
git diff --exit-code b98bc3f2baad72c13733552c7bcafedc747556b6 HEAD -- app.js index.html styles.css
sha256sum app.js index.html styles.css
```

The expected hashes match the starting commit.

| File | SHA-256 |
| --- | --- |
| `app.js` | `e9adc598f60896f119f32a40d26a09d92786bf64d752ebf2a11c8b8ae6055a46` |
| `index.html` | `bb59959251abb221a80d6787f6d3c4d283a0bb2459aa5f40a54f7f0b597614af` |
| `styles.css` | `fb37c6fe1ff2cd39b0eea5a7e1199901799febc9fbe139b7552725b9537965d8` |

The implementation contract and later workbench integration are in [INTEGRATION_PROPOSAL.md](INTEGRATION_PROPOSAL.md).

## Independent hardening review

The follow-up review added ten regression tests: nine covering missing state, explicit conflict review and frozen export integrity, plus a Preview-only engine selector test. The existing 25 tests remain. Raw output from the final local rerun is in `test-results.tap`; aggregate evidence and frontend hashes are in `REVIEW_RESULTS.json`. No test in that rerun made a live provider call.

The missing-state reproduction used a refund rule that requires `phase=approval`, with no phase supplied. Previously a lexical match returned ready/compact. It now returns unresolved before sizing or generation; the same checks cover shared, explicit and dependency selection and Python parity.

The private three-file UIC slice was structurally evaluated again with calls disabled. All 43,394 UTF-16 source code units were retained. This intentionally produces three retained source records in one shared module and does not demonstrate semantic extraction, accuracy or savings. The original heuristic still produces 52 rules in ten modules. No private source or per-case model output was committed.

Live Meta behavior, latency, token savings and optimizer break-even remain pending: the local environment has no Meta credential, and protected Vercel POST access has not been verified from this agent. The branch Preview uses the existing server credential when the owner starts analysis and comparisons. Mock token counts and millisecond timings must not be presented as live Meta performance.
