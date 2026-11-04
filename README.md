# Promptimize.ai

**Refactor tangled promptbases into workflow modules, then check whether the same behavior costs fewer tokens.**

Built with **Meta Muse Spark 1.3** and an optional **Muse Wonder 1.0** architecture advisor through the Meta Model API.

## Start here: project and Meta verification

| What to inspect | Direct link |
|---|---|
| Problem, solution, architecture and results | [Written project description](Promptimize_Project_Description.md) |
| Exact Meta model IDs, API integration, live receipts and verification steps | [Verification of Meta AI tooling](Promptimize_Meta_AI_Verification.md) |
| Primary evidence: 32 real Muse Spark task calls | [Cloud benchmark receipts](demo/generated/benchmark-cloud.json) |
| Spark context extraction and Wonder architecture call | [Live context/design receipts](docs/advisor-live-result.json) |
| Hosted application | [Open Promptimize](https://promptimize-steel.vercel.app) |
| Before/after demonstration and saved evidence | [Forma benchmark](https://promptimize-steel.vercel.app/demo/bench.html) |

**Recorded result:** on eight fictional scenarios repeated twice, both versions passed 16/16 reviewed checks. Task tokens fell **58.5%** and estimated task cost fell **51.9%**, excluding one-time optimization setup. Median model latency did not improve. See the verification document for method, overhead and limitations.

## Why this exists

Meta's [Thin Orchestrator article](https://engineering.fb.com/2026/10/19/ml-applications/thin-orchestrator-ai-agent-architecture/) describes instructions from different systems interfering inside an overloaded agent. During my UIC internship, I encountered a related maintenance problem: long, scattered prompts, repeated rules and exceptions that were difficult to trace safely. Promptimize turns that manual cleanup into a reviewable engineering workflow.

**Input → Audit → Proposal → Review → Candidate → Tests → Downloads**

Upload supported prompts, intents and scripts; optionally add separate context documents. Inspect source-linked rules, edit proposed folders and corrections, freeze the candidate, and compare reviewed cases against the original. Failures inform the next proposal; they never silently patch the frozen version.

Downloads include real workflow folders, prompt files, intent registries, source evidence and a Python loader. An optional architecture kit adds suggested adapters and a precise SVG. Muse Image illustration is implemented separately but is not claimed as live-verified.

## Stack and local checks

HTML/CSS/JavaScript · Node.js Vercel API functions · Meta Model API · Python exported runtime · Markdown/JSON artifacts. No database or vector store is required.

Keep credentials server-side. See the API client for the accepted environment-variable names; never place keys in frontend files or downloads. Normal builds make no model calls.

```sh
node --test tests/backend/*.test.cjs
node test-contract.cjs
node test-jd-adapter.cjs
node test-review.cjs
node test-simulation.cjs
node tests/check-build.cjs
```

These checks use mocked providers or local fixtures. Production integration still needs application-specific state and review. Genuinely required missing state or unresolved routing must be investigated rather than assigned invented values. The public Forma demonstration uses fictional data, not private UIC source.

[Integrated release guide](docs/INTEGRATED_RELEASE.md) · [Forma method and limitations](docs/FORMA_SHOWCASE.md) · [Historical development README](DEVELOPMENT_HISTORY.md)
