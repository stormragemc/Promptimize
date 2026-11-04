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

- Context extraction: `muse-spark-1.3`, low reasoning, 4,000 output-token cap.
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
