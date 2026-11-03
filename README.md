# Promptimize

An evidence-first prototype for refactoring overloaded promptbases. It shows source-linked rules, constructs a workflow-scoped candidate using the exact quoted wording, and compares bounded synthetic cases against the original context. Muse Spark 1.3 extracts the rule candidates and runs the cases.

## Overnight build stages (Singapore time, 3–4 November 2026)

| Stage | Target | Review checkpoint |
| --- | --- | --- |
| 1. Foundation | 11:30 PM | Live Vercel preview, Meta key recognized server-side, synthetic sample loads. |
| 2. Audit | 1:00 AM | Muse extracts rules with literal source quotes and file/line evidence; invalid quotes fail closed. |
| 3. Candidate | 2:30 AM | Shared and workflow modules, route view, approved mapping, exportable JSON. |
| 4. Evaluation | 4:30 AM | Same cases on all-context baseline and scoped candidate; simulated lookup, actual provider token usage, failures captured as next-iteration notes. |
| 5. Morning handoff | 6:00 AM | Deployed link, test instructions, measured sample results, known limitations. |

After 6 AM: inspect Marcel's feedback; extend the adapter to a **small, selected portion** of the supplied UIC archive locally, keep that code private, improve evidence review and cost estimation, polish responsive layout, record the judge demo, and freeze by 8 PM. No employer code belongs in the public repository or public demo.

## Try it

1. Open the deployed Vercel preview and click **Load the sample**.
2. Click **Analyze bundle**. This makes one Meta Model API call. Review source quotes and workflow tags; approve only if they match the source.
3. Open **Candidate** and inspect the before/after loading map. Download the JSON if useful.
4. Open **Tests** and click **Run comparisons**. This runs six synthetic cases on both versions, with up to two responses for each run that requests a lookup. It makes up to 14 more Meta responses.
5. Check task pass counts and actual provider-reported total tokens. A candidate failure is a next-iteration note, never an automatic patch.

The first implementation is an honest narrow slice: it accepts 1–12 text files with a 50,000-character cap for experimental analysis of the same three-workflow domain, asks a human to review model-extracted rules, and measures one stochastic run per case **only for the bundled sample**. The UI does **not** claim production correctness, exact dollar cost, generalized arbitrary-repo migration, or statistical significance. Export is a JSON snapshot; a runnable loader and zip export are later stages.

## Local development

Static assets are at the root. `api/` contains Vercel Node functions. The server expects `promptimizer_musespark` (the exact environment variable configured on the connected Vercel project), with `META_API_KEY` as a conventional fallback. Keep either key server-side and never prefix it with `NEXT_PUBLIC_`. No dependencies, database, or account setup are required. `vercel dev` serves the local app after linking to the project and configuring a development key. The Vercel Preview/Production secret does not automatically appear in a local terminal.

## Safety and evaluation limits

- Sources are sent to Meta only when Analyze is clicked. Test execution is opt-in.
- A quoted rule is accepted only if it occurs verbatim in the named source file. This validates provenance, **not** the model's interpretation or completeness.
- The candidate reuses exact source wording. Multi-workflow dependencies still require review and may fail tests.
- The run route allows only six synthetic test IDs and a one-step simulated event-status lookup. It has no production side-effect tools.
- The token comparison includes the baseline/candidate task calls and the simulated lookup follow-up, but **does not yet include the one-time analysis call or real routing/classification**, and it is not a projected bill. Provider pricing and caching are not modeled. Do not quote a cost-saving percentage from this graph.
- Model outputs can vary. One pass/fail per case is a debugging signal, not a reliability guarantee. The baseline can be wrong too.
- The browser holds the candidate and traces for the session; reload discards them. Download the JSON for a record.
