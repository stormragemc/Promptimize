# Forma: measured Promptimize showcase

Forma is a fictional HR navigation app inspired by the maintenance problems that motivated Promptimize. It contains no UIC source or real applicant data. The before and after URLs serve the same UI and backend. The runtime switches between the original prompt loader and the frozen Promptimize export.

## What actually ran

The original fixture has 26,871 source characters across three mixed files. It repeats guardrails and cross-workflow exceptions and mixes recruitment, interview, candidate information, leave, payroll, expenses, travel, assets, attendance and benefits. The naive loader reads all three files for every request. Canonical intent declarations occur inside those files; a useful global catalog is also supplied.

The current semantic Promptimize pipeline analyzed that source through real Meta calls. It produced 64 evidence-linked rule records in 12 modules. Multiple records can reference the same paragraph when the model decomposes its actions, so this is not a claim that 64 unique source rules existed. Every source block has verified evidence; no unverified source text was discarded. There were no approved semantic removals and no reported exact duplicate consolidation. The demonstrated saving comes mainly from selective context loading, not a claim that every duplicate has been eliminated.

The reviewed export is installed as actual files under `demo/generated/after/`. It includes meaningful per-module `intents.json` registries. Shared-policy modules describe their scope and source links instead of inventing executable intent IDs. The app reads and verifies physical prompt/intent files, the routing metadata, frozen text and source fingerprints. A modified registry or prompt is rejected.

Frozen snapshot: `9507b75ec99ca4b91575528af0f511b9332c66059038977487bdd32440d26027`.

Exact exported package hash: `2e5e157a218dc37f8e3c667d15bb951aaea5af6a805765634cd064e44567c2a3`.

## Primary live cloud result

Eight fixed scenarios, two repetitions per scenario, each run on both versions. Order alternates. Both use Meta `muse-spark-1.3`, minimal reasoning, the same 500-token output cap and the same handler. No artificial delays, hidden retries, or prompt patches. Request sizing occurs before generation with a 240,000-token bounded experiment allowance. Cloud execution does not depend on a browser or laptop.

| Measurement | Before | After |
|---|---:|---:|
| Reviewed checks passed | 16/16 | 16/16 |
| Input tokens | 83,380 | 33,480 |
| Output tokens | 1,494 | 1,784 |
| Total task tokens | 84,874 | 35,264 |
| Reported cached input | 30,630 | 11,287 |
| Estimated task cost, USD | $0.07688 | $0.03702 |
| Median model time | 1.100s | 1.156s |
| p95 model time | 1.775s | 2.658s |
| Median server work, including sizing | 1.630s | 1.859s |

All 16 corresponding final states match, and each side independently passes the expected action/entity/state checks. Input tokens fell 59.8%, total tokens 58.5%, and estimated task cost 51.9%. Median model latency increased 5.0%; **there is no proven speedup**. Provider cache differences and service variability are included in the evidence rather than filtered out. The server-work measurement excludes browser networking and UI rendering. It is not an end-user latency benchmark.

The successful optimizer setup is separately estimated at $0.13962. Earlier failed experiments include unknown usage; total historical spend and overall break-even are therefore unverified. Costs use the app's existing recorded Meta Standard rates and are estimates, not invoices.

`demo/generated/benchmark-cloud.json` contains all 32 primary live receipts and the exact method. `benchmark.json` is the presentation copy. The cloud deployment ran commit `3d56897589382b7ea3cf1a7c12b4850a218752a4`; later changes harden the fixture server and display its evidence without changing the frozen prompt text. Current offline checks bind the recorded package hash, replay the expected state checks, and match all eight exported Python/Node requests exactly.

## Bugs found, investigated and preserved

The first live analysis invented `state.` prefixes for flat request fields. Grounding had accepted a matching leaf field, but runtime resolution correctly refused the nonexistent full paths. The extraction contract and full-path evidence validation were fixed, then a new proposal was generated. The frozen failing draft was not patched. `failed-first-run.json` retains the failure and its known receipts; one extraction call has unknown usage.

An intermediate 32-call benchmark uploaded a draft package for after requests. Its results are retained in `benchmark-draft-transfer.json`; its browser wall time includes that extra transfer and is not the primary latency comparison. It also passed all cases and reduced tokens, but showed a larger latency regression. It was not discarded because the installed result looked better.

The first cloud runner had a response-adapter chaining error. That stopped the experiment without a captured task receipt. `failed-cloud-adapter.json` records the failure and notes that a provider call may have consumed tokens. The adapter was corrected before the explicit new cloud experiment above.

## Presentation walkthrough

1. Open the before app. Open interview review and ask “Show me the facial analysis.” The panel switches to Presentation, whose legacy canonical identifier is `facial`. This is synthetic navigation, with no emotion or hiring inference. The receipt shows actual tokens and time.
2. Ask “Close this” in the panel. Only that panel closes; the candidate workspace remains open.
3. Open candidate information and ask “Go to education.”
4. Click Add interview attendee, then send “Alex Example.” The name is routed to an interview attendee, not an applicant search. No real invitation is sent.
5. Open the Promptimize lab. Inspect the original mixed source, the generated module paths and source-linked rule evidence.
6. Open the after app and repeat the same requests. Show the receipt and then the primary cloud report. Explain the token/cost reduction and unchanged tested behavior. Report latency honestly.

A concise presentation claim: “We gave Promptimize a working but tangled HR assistant promptbase. On eight scenarios, repeated twice, its exported modules preserved all expected outcomes while using 58.5% fewer task tokens and roughly 52% lower estimated task cost. We also found and fixed a real state-path validation bug. This run did not establish a latency improvement.”

This supports a bounded engineering demonstration, not a claim of production-wide accuracy, an actual UIC migration, or guaranteed Meta adoption. The production Gateway composer was never supplied.

## Run and download

Both standalone app ZIPs are generated by `node demo/package-apps.cjs`. They contain identical UI/backend source; only their default version configuration and explanatory README differ. Both keep original source and evidence for provenance. The after runtime loads only the selected exported modules. Run either with Node 24 and no npm installation:

```sh
# Configure META_API_KEY securely in your environment first.
node demo/serve.cjs
```

Open `http://localhost:3000`. Each assistant submission uses a real Meta call. Normal navigation and replay use no model calls. `after-promptbase.zip` contains the exact exported promptbase alone.

The Vercel one-off build command is `node demo/cloud-benchmark.cjs --run-live`. It must be explicitly requested; normal builds run only the archive packager and never call Meta. Do not promote production or merge PR #2 without owner approval. Demo video recording/editing is intentionally deferred until requested.
