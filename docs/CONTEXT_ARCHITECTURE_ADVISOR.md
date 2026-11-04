# Context uploads and architecture proposals

This feature is isolated on `feature/context-architecture-advisor`, created from main commit `73967fb98d34263ca1a3fc77bcb758d5175ae83f`. It does not merge the separate regression/demo branch, change production, or automatically adopt generated code.

## Try it

1. Load a sample or choose the promptbase files.
2. In **Give it the project context**, type a description, or choose a context file/folder. Context uploads support Markdown, text, JSON, YAML, CSV, Python, JavaScript and TypeScript: up to 12 files, 40 KB combined. PDFs, Office documents and archives are not supported in this first version. Scripts are read as text, never executed.
3. Click **Read context with Meta**. Review the extracted interpretations and their exact source quotes. Edit or remove interpretations, and approve the context. Uploaded documents do not replace original prompt instructions.
4. Click **Analyze bundle**. Approved context selects the existing semantic backend. Its source-evidence and candidate-review rules remain in force.
5. Open **Proposal → Design the loading strategy**. Preview the savings scenario without generating an assistant response. Set the expected fallback rate and extra routing overhead.
6. Choose Spark, Wonder, or Auto and click **Propose an implementation**. This is one bounded design call. Review its reasons, source-rule references, implementation steps, risks and tests.
7. Download the **architecture kit**. It contains Meta-generated Python starter code, an implementation guide, JSON evidence, an exact editable `flow.svg`, and a Muse Image prompt. The regular promptbase export remains separate and unchanged.
8. Optionally generate one **Muse Image** illustration. Inspect it for incorrect labels. The precise SVG remains the authoritative diagram. No video recording or generated video is added.

Changing project context requires a new promptbase analysis. Changing a candidate snapshot invalidates the old architecture download. A failed design call cannot edit the candidate.

## What the recommendation means

Meta is asked to distinguish techniques already present from proposed additions and ideas that should be deferred. Supported categories are selective loading, dependency-aware loading, deterministic routing, prompt caching and model routing.

The semantic backend already selects compact context, includes approved dependencies and can expand once before generation. It stops when required state is unresolved. The advisor should recognize that behavior rather than claim to invent it. Generated adapters must call the existing loader, respect unresolved results and retain its integrity checks.

The scripts are starter implementations for an engineer to review in a separate copy. Promptimize does not execute generated code, deploy it, or claim that its syntax and behavior are proven merely because Meta returned it. Run syntax checks, unit tests and paired application scenarios before adoption. Test findings belong to a new proposal, never an automatic patch of a frozen candidate.

## Forecast calculation

The preview uses a transparent scenario calculation:

`expected instruction characters = compact characters + fallback probability × broad characters + extra routing characters`

Compact context includes shared rules, a workflow's rules, approved dependency closure and the approved brief. Broad context includes retained instructions and approved reference lengths. Workflows receive equal weight until the user provides a traffic mix in a later version.

The fallback assumption is deliberately conservative: both a compact attempt and a broader retry consume input. The existing pre-generation expansion can be cheaper. This forecast is not a replay of the runtime selector on production requests.

Token estimates divide characters by four, with a three-to-five characters/token range. This is a heuristic, not a target tokenizer, confidence interval or bill. The preview shows sensitivity at 0%, 10%, 25%, 50% and 100% fallback and the fallback rate at which the modeled saving disappears. Positive token changes are red; reductions are green.

The forecast excludes user/tool/message envelopes, generated and reasoning output, cache discounts and optimizer setup. At the same model and input price, the input-cost percentage follows the input-token scenario. Total cost, accuracy and latency gains remain unproven until measured. No model-generated numerical savings are presented as evidence.

## Models and spending

- Context extraction: `muse-spark-1.3`, minimal reasoning, 6,000 output-token cap.
- Design proposal: Spark by default; optional `muse-wonder-1.0`, low reasoning, 6,500 output-token cap. Auto selects Wonder at 80 or more source rules, otherwise Spark. This is an explicit, inspectable complexity heuristic, not evidence that Wonder improves a particular project.
- Per-pass allowance: default 24,000 tokens; valid range 1,000–40,000. Meta's input-token endpoint sizes the complete design/extraction request before generation; a pass is refused if input plus capped output exceeds the allowance.
- No automatic retry or automatic model escalation on failure. The model choice applies only to the advisor, not every task in the user's assistant.
- Optional illustration: one `muse-image-1.0` request per click. It has a separate image charge and is outside the text-token allowance. The control explicitly identifies that separate call. No image call occurs during ordinary analysis or builds.
- Receipts retain model, provider-reported usage when available, input sizing, output cap and timestamp. Failed calls can have unknown usage; unknown never means free. Historical context/design overhead must be included in any overall break-even calculation.

Keys stay server-side. Standard model IDs are used. The application never reads secret values back from Vercel or includes them in downloads.

## Architecture

`advisor.js` provides the context-review and recommendation interface; `advisor.css` preserves the existing white/violet/pink visual identity. `api/context.js` performs source-linked extraction. `api/architecture.js` provides non-generative preview, bounded design generation and ZIP download. `api/_advisor.js` validates context, evidence, model selection, estimates and template paths. `api/architecture-image.js` provides optional illustration generation.

The existing semantic context normalizer, analysis, dependency checks and export runtime are reused. No database, vector service, new framework or generated-code executor is introduced. The current candidate is never modified by these endpoints.

## Review boundary

Test and review this branch before merging. Main and production must stay unchanged until Marcel approves. Demo recordings remain deferred; the workflow and media behavior are documented here instead.

## Live check and hardening

The first cloud check completed real context and design calls, but semantic extraction timed out and the generated adapter invented workflow labels. That partial result is retained in `advisor-live-first.json` and is not accepted as a successful refactor. Extraction timeouts now have a longer bounded window. State-field facts must be exact source-backed identifiers, and generated Python must use the reviewed runtime bridge rather than bypass the exported loader. The bridge rejects unknown workflow hints and stops unresolved requests. Its code is included in the kit alongside the model-generated project adapter.

No recordings were created. Browser inspection was unavailable in this session; UI state checks use DOM doubles, and the owner should inspect the real preview before merging.

The second live check showed the old extraction cap was being consumed mostly by reasoning (3,042 of 3,800 output tokens), leaving an incomplete structured response. That failed attempt and its usage are retained in `advisor-live-second.json`. Extraction now uses minimal reasoning with a 6,000-token output cap; full literal state paths are checked rather than accepting only their final field name. The overall analysis call/reservation limits remain in force. This is a new proposal implementation, not an automatic repair of a frozen candidate.

The third check completed source extraction (25 retained rule records across eight modules), but optional comparisons hit their old reasoning caps. Those receipts are retained in `advisor-live-third.json`. Comparisons now use low reasoning with a 6,000-token cap. Context-document extraction uses minimal reasoning with the same cap. Model outputs remain proposals requiring source validation and human approval; reducing reasoning is not a claim of better accuracy.

## Successful live check

`advisor-live-result.json` records the successful fictional-data cloud run at commit `e675da526e48db883f7584a5e88028c412cc8f79`. Context extraction, source extraction, all three comparison passes and the Muse Wonder design pass completed with recorded usage: 19,508 known tokens. The result retained 21 evidence-linked rule records in 11 modules and produced the generated project adapter, reviewed bridge, architecture report and diagram kit. These counts do not prove production behavior or savings.

The returned adapter passed Python parsing and an isolated manual check of ready/unresolved passthrough and field validation. Production integration and live Muse Image generation were not tested. The forecast for this small fixture was a 19.8% instruction-input increase at the configured fallback/overhead assumptions; this was reported as a scenario, not hidden or claimed as a saving. Earlier failed attempts and unknown usage remain documented separately.

Normal builds run only `node --check advisor.js`, never the paid smoke runner. Running the live smoke script requires its explicit `--run-live` flag and a separately authorized budget. Refreshing the current prototype requires re-entering the optional context/advisor state; download the kit and evidence before closing the session.
