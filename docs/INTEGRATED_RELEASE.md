# Integrated release verification

This release combines PR #2 (`feature/regression-measurements`) and PR #3 (`feature/context-architecture-advisor`). Their original heads remain parents of the integration commit.

## Included behavior

- Loading animations, scroll-triggered tutorial, header guide, idle next-step hints, animated finish statistics and downloads.
- Context-document upload and source-linked review; optional architecture proposals, template scripts, SVG and Muse Image illustration.
- Reviewed regression plans with editable scenario JSON, linked rules, repetitions and a total token allowance. Plan approval and request sizing precede every run.
- Exact initial and post-lookup request sizing. Follow-up context is selected again after simulated state changes. Missing state identifies the case, field, stage and source evidence; incomplete sizing never becomes zero-token savings.
- Frozen candidates, retained usage receipts and failures carried into the next proposal. Matching correct final states can show the trace celebration.
- Forma before/after apps and existing measured cloud evidence. Builds only package local downloads; they do not call Meta.

## Integration fixes

The newer comparison recovery is applied to the reviewed-plan endpoints, rather than replacing the reviewed plan with the older six-case runner. Context and architecture requests use the shared loading indicator. Exported Python uses the workflow hint only for routing and sends the same unmodified scenario envelope as Node. Forma archives include the shared sample contract required by the combined backend.

## Checks

- `node --test tests/backend/*.test.cjs`: 94 tests, deterministic provider and functional DOM fixtures.
- `node test-contract.cjs`, `node test-jd-adapter.cjs`, `node test-review.cjs`, `node test-simulation.cjs`.
- `node tests/browser/build-experience-fixture.cjs`: isolated synthetic visual fixture, with all combined assets inlined.
- `node tests/check-build.cjs`: syntax/asset verification and both app archives, no provider calls.

Tests cover missing-state recovery through the reviewed-plan API, repeated reserves, exact request parity across sizing and generation, Python export parity, plan and snapshot binding, conflict review, archive integrity and the complete mocked comparison/download flow.

No fresh paid Meta benchmark or browser visual assessment is claimed for the integration. Prior live benchmark receipts remain unchanged. Historical handoff documents describe their original branch checkpoints; use this release guide for the combined flow.

## Deployment

`vercel.json` explicitly sets the static output directory to the repository root (`.`), matching this app’s root-level HTML/CSS/JS and avoiding Vercel’s default `public` folder assumption. The build also packages the Forma ZIP downloads without making model calls.

## Manual review

Open the production app, reload, and use the header paper-plane guide. Run Input → Audit → Proposal → Review → Candidate → Tests → Downloads. In Tests, build the plan, edit any needed scenario state, approve it and check the allowance before starting comparisons. Optional context and architecture calls require their own reviewed inputs and explicit actions. A repeat visit may have already marked the tutorial seen; the header guide remains available.
