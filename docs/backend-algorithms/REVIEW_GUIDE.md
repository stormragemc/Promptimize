# Review the backend branch before merging

Branch: `backend/semantic-refactor`. Pull request: https://github.com/stormragemc/Promptimize/pull/1

The frontend files are unchanged. Main and production retain their historical default analysis. The branch Preview opts into `semantic-v1` through a server-only variable scoped to that branch and Preview. The variable has no effect in production.

## Try it in the existing interface

1. Open the backend branch Preview linked from the pull request or Vercel and sign in with your existing Vercel access.
2. Start a fresh analysis. A restored historical session is an older snapshot and will not transform itself into a semantic proposal.
3. Use the bundled sample first. Then upload the authorized UIC folder; the current input flow selects its three supported files.
4. Click Analyze. This starts bounded real Meta optimizer calls on the server. The source-only browser run has no new project-context form.
5. Inspect the Audit and Proposal. Check that important exceptions remain, rules have source links, placements make sense and edited folder names survive export. Unclaimed text is retained, so an incomplete extraction may deliver no savings.
6. Review corrections, approve/freeze, then prepare the bundle. Run the token preflight before starting comparisons. If the candidate cannot improve initial input or a case is unresolved, the existing gate should prevent the suite from starting.
7. Where the suite is permitted, compare the same cases on both versions. Failures remain evidence for a new proposal. They must not silently modify the frozen candidate.
8. Download the ZIP. `runtime.json` is included even though the unchanged frontend's illustrative file list does not yet list that extra file. The package-check file count describes the actual bundle.

The UI does not yet display every semantic finding or offer the new context and conflict-resolution inputs. Inspect the Analyze response's `semantic` records in the browser Network panel, or use the API contract in `INTEGRATION_PROPOSAL.md`. A blocked conflict needs an explicit API review decision or a new context version and analysis. A notes-only edit does not clear it.

## Reproduce the zero-cost checks locally

Check out this branch with Node 24 and Python 3.10 or later. No package installation or credential is required for these checks.

```sh
node test-contract.cjs
node test-jd-adapter.cjs
node test-review.cjs
node test-simulation.cjs
node --test tests/backend/*.test.cjs
node tests/backend/semantic-cli.cjs
node tests/backend/semantic-cli.cjs --with-context
```

All 35 backend tests plus four legacy suites should pass. Synthetic CLI usage is a fixed provider double, not real Meta usage. The safety suite includes the original missing-phase reproduction and verifies zero provider calls on refusal.

## Check an exported bundle

For a JD-viewer export, run the following from the unzipped directory:

```sh
python run.py --case U01 --dry-run
```

This prints the exact request or an unresolved receipt without using Meta. Check the selected rules and required state. Copy the export to a disposable directory, edit a module Markdown file and repeat: the runner must stop with a changed-after-review message. Restore the original file. To change behavior, save a correction in Promptimize Review and export a new frozen candidate; do not alter runtime hashes to reuse old test evidence.

## Real UIC acceptance gate

Keep the private request outside the public repository. The input is `{ "files": [{ "name": "...", "content": "..." }] }`, with optional reviewed `projectContext` and `promptContext` as documented. These examples use a Unix private path; substitute your own.

```sh
node tests/backend/evaluate-uic.cjs --request /private/uic-request.json --structural --with-original
node tests/backend/evaluate-uic.cjs --request /private/uic-request.json --live --warm --with-original
```

The first command makes no model calls. The second requires the existing Meta credential securely configured in the process environment and makes bounded paid optimizer and case-generation calls. Never commit the request, credential, source-bearing export or private output. Context comparison is omitted when context is not supplied.

Require complete development and holdout results, no critical permission or exception regressions, actual provider usage for completed and incomplete calls, lower task-run usage, and a worthwhile break-even after one-time optimizer overhead. Record unresolved cases and provider errors separately from behavioral failures. One run of ten cases is a demo check, not a production reliability estimate.

Live evidence remains pending until that run succeeds. Do not merge on mock token counts. The pull request remains a draft for owner review and explicit merge approval.
