# Promptimize.ai — Written Project Description

**Meta Global AI Developer Hackathon submission**

[Live app](https://promptimize-steel.vercel.app) · [Meta AI verification](Promptimize_Meta_AI_Verification.md) · [Recorded benchmark](demo/generated/benchmark-cloud.json)

**Primary theme: Build for Your World.** The project addresses promptbase maintenance encountered firsthand during an HR software internship.

## Why we built it

**We built Promptimize around a failure Meta described in its own engineering blog: an AI agent given so much context that it started applying the wrong rules.**

Meta’s engineers put it plainly: **“It worked in demos. In production, it started hallucinating.”** Their *Thin Orchestrator* article describes instructions from different systems interfering with one another. They improved the architecture by separating responsibilities and loading specialized knowledge when needed. [1]

I recognized the maintenance problem immediately.

During my backend internship at UIC, I worked with an HR assistant whose prompts, intent classifications and workflow instructions were scattered across the codebase. Rules were repeated. Exceptions were mixed into unrelated workflows. Understanding one instruction meant tracking down several others. Individual prompts could run to hundreds of lines, mixing unrelated tasks and repeated fixes. The problem affected both the AI, which received irrelevant context, and the engineers trying to maintain it.

A simple request could carry a mountain of irrelevant instructions. But deleting those instructions was dangerous: a line that looked unnecessary could contain the exception that kept another workflow working. Every cleanup meant asking the same exhausting question: **what will break if I move this?**

We worked through that cleanup manually. That experience became the reason for Promptimize: make this work easier to inspect, repeat and test, instead of asking engineers to untangle everything by hand again.

Meta’s context-mapping article reinforces the same lesson: agents need a reliable map of a codebase’s hidden rules and dependencies. Its organizational knowledge system also shows why updates need evaluation and human review. [2][3] Promptimize applies those principles to reorganizing an existing assistant’s instructions.

## The problem

A working AI assistant can accumulate a messy **promptbase**: the prompts, intent definitions and scripts that assemble its instructions.

Over time, teams add more rules to fix individual failures. The assistant receives more irrelevant context, costs more to run, and becomes harder to change safely.

Shortening the text alone does not solve this. The real challenge is deciding which instructions belong together, which exceptions must remain connected, and whether the new structure still produces the expected behavior.

## Our solution

Promptimize turns a tangled promptbase into organized workflow folders, with a reviewable proposal and a before-and-after test.

1. **Read and audit.** Upload supported prompt, intent and script files. Optionally upload separate context documents; review and approve the source-linked facts extracted by Muse Spark before using them. Muse Spark identifies instructions and their relationships. Each extracted rule links back to its source so a person can check the interpretation. Uploaded scripts are read as text.
2. **Review the structure.** Inspect the proposed folders, changes and retained rules. Correct the proposal before approving it.
3. **Build the candidate.** Generate real workflow folders, prompt files, intent registries and routing information. Freeze the approved version for testing.
4. **Load less context.** The generated loader selects shared instructions and relevant workflow modules, follows their dependencies, and expands the context within limits when needed.
5. **Test and download.** Run the same reviewed cases against the original and candidate. Compare expected actions, extracted information, final application state, tokens, estimated cost and timing. Failures inform the next proposal; they do not silently rewrite the frozen candidate.

The result is a usable folder structure and loader, accompanied by evidence of what changed and what was tested.

An optional architecture advisor uses Muse Spark by default or Muse Wonder for a design pass. It proposes retrieval/loading techniques and exports Python starter adapters, a review guide and an exact SVG diagram. Muse Image is implemented as a separate optional illustration call. Generated templates are not executed or automatically adopted; predictions remain separate from measured results. Spark and Wonder have recorded live evidence. A successful live Muse Image call has not been verified.

## Technical architecture and Meta integration

| Part | Technology | What it does |
|---|---|---|
| Web interface | HTML, CSS and JavaScript | Uploads, proposal review, visual comparisons and downloads |
| Backend | Node.js API functions on Vercel | Coordinates analysis, validation, token sizing and test runs |
| AI analysis and decisions | Meta Model API, `muse-spark-1.3` | Extracts context facts and rules, compares related instructions and interprets test requests |
| Architecture proposals | Spark by default; optional `muse-wonder-1.0` | Suggests implementation techniques and generates reviewable starter adapters |
| Optional illustration | `muse-image-1.0` | Generates a visual explanation; the exact SVG stays authoritative |
| Context selection | Local indexing and dependency checks | Finds relevant instructions and preserves connected exceptions |
| Downloadable runtime | Python 3.10+, Markdown and JSON | Loads the exported workflow modules outside the website |

The analysis combines structural parsing, exact duplicate checks, BM25-style shortlisting and bounded Muse Spark calls. A dependency graph preserves reviewed relationships, while deterministic context selection starts compact and can expand once. The implementation does not require embeddings or a vector database. Local validation checks source references and required context. This keeps the model focused on interpretation while code handles repeatable checks.

Muse Spark is called from the server through Meta’s Chat Completions API. Meta’s input-token counting endpoint sizes requests before generation. Output caps and token reservations limit test runs. Counts are sizing estimates; actual usage is recorded separately.

## What we demonstrated

We built **Forma**, a fictional HR workspace inspired by the maintenance patterns encountered during the internship. Its original promptbase mixes 26,871 characters across three files. Promptimize generated 12 workflow modules, installed as actual files in the after version.

Both versions use the same interface, backend and Muse Spark model. Only the prompt-loading approach changes.

The cloud benchmark ran eight scenarios twice on each version: **32 live task calls**.

| Measurement | Original | After Promptimize |
|---|---:|---:|
| Expected outcomes passed | 16/16 | 16/16 |
| Total task tokens | 84,874 | 35,264 |
| Estimated task cost | $0.07688 | $0.03702 |
| Median model response time | 1.100 seconds | 1.156 seconds |

**All 16 paired final states matched, while task tokens fell 58.5% and estimated task cost fell 51.9%.**

The demonstrated savings came mainly from loading relevant modules. This run did not establish a speed improvement. Cost figures exclude the separately estimated $0.13962 successful optimization setup. These are fixed demonstration cases, not a production-wide accuracy claim or a completed migration of UIC’s system.

Promptimize makes a difficult engineering task reviewable: **untangle the instructions, preserve the important behavior, and measure whether the change actually helped.**

## Current limits

This is a prototype with supported event and JD-viewer demonstration adapters, not automatic migration of arbitrary software. Test scenarios must supply their documented application state. Preflight refuses genuinely unresolved requirements instead of inventing values or treating missing requests as zero-token savings. The saved Forma benchmark is a separate complete experiment using explicit scenario state.

No private UIC source or real HR data is included in the public demonstration. The production Gateway composer was not supplied. Human review and application-specific integration remain necessary.

## References and evidence

1. Engineering at Meta, [The Thin Orchestrator: How We Made Our AI Agents More Reliable by Giving the Router Less to Do](https://engineering.fb.com/2026/10/19/ml-applications/thin-orchestrator-ai-agent-architecture/), 19 October 2026.
2. Engineering at Meta, [How Meta Used AI to Map Tribal Knowledge in Large-Scale Data Pipelines](https://engineering.fb.com/2026/04/06/developer-tools/how-meta-used-ai-to-map-tribal-knowledge-in-large-scale-data-pipelines/), 6 April 2026.
3. Engineering at Meta, [An Organizational Second Brain: Building an AI That Learns From Experts](https://engineering.fb.com/2026/09/02/ml-applications/organizational-second-brain-ai-learns-from-experts/), 2 September 2026.
4. Promptimize, [recorded cloud benchmark](https://github.com/stormragemc/Promptimize/blob/97bc0f1cdce09eb55c6c89994b569b45d5239c8c/demo/generated/benchmark-cloud.json) and [demonstration method](https://github.com/stormragemc/Promptimize/blob/97bc0f1cdce09eb55c6c89994b569b45d5239c8c/docs/FORMA_SHOWCASE.md).

The Meta articles establish the engineering motivation. The benchmark reports Promptimize’s own results.
