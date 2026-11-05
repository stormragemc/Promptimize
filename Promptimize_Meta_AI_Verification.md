# Promptimize.ai: Verification of Meta AI Tooling

**Meta Global AI Developer Hackathon submission**

[Live app](https://promptimize-steel.vercel.app) · [Project description](Promptimize_Project_Description.md) · [Saved Forma benchmark](https://promptimize-steel.vercel.app/demo/bench.html)

## Verify the integration in one minute

1. Open the [Meta API client](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/api/_meta.js): it defines `muse-spark-1.3`, allows `muse-wonder-1.0`, and calls Meta's hosted API using a server-side key.
2. Inspect the [32 live Forma task receipts](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/demo/generated/benchmark-cloud.json). Their `model`, `usage`, `recordedAt`, decisions and final-state checks show actual Spark responses.
3. Inspect the [context and architecture run](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/docs/advisor-live-result.json): Spark extracts source-linked facts and instructions; Wonder generates the architecture proposal and starter adapter. The architecture receipt reports `muse-wonder-1.0` and 5,366 provider-reported tokens.
4. Compare the [installed exported promptbase](https://github.com/stormragemc/Promptimize/tree/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/demo/generated/after) with the [before](https://promptimize-steel.vercel.app/demo/?version=before) and [after](https://promptimize-steel.vercel.app/demo/?version=after) apps. Assistant submissions make paid Meta calls; the saved report can be inspected without rerunning them.

These implementation and receipt links are pinned to reviewed source commit `87f0e73b7c0e2665b18d24ba5d1ece39cafcd167`. The historical execution commits are recorded below. The latest image convenience endpoint is linked on main; it does not alter those historical receipts.

## Models, purpose and verification status

| Model / API | Where it is used | Why this role | Evidence status |
|---|---|---|---|
| Muse Spark 1.3 (`muse-spark-1.3`) | Context-document facts, instruction extraction, targeted rule comparison, default architecture proposals and old/new assistant decisions | Focused text interpretation with structured JSON, bounded calls and local validation; the same task model keeps the promptbase comparison controlled | Real context, optimizer and task receipts retained |
| Muse Wonder 1.0 (`muse-wonder-1.0`) | Optional architecture design pass and Python starter adapter generation | An explicit design option for broader implementation questions; it is not invoked on every assistant request | Successful live architecture receipt retained |
| Muse Image 1.0 (`muse-image-1.0`) | Optional architecture illustration | Produces an explanatory image; an exact code-generated SVG remains authoritative | Endpoint implemented; no successful live image receipt is claimed |
| Meta input-token counting | Sizes the rendered request before text generation | Enables bounded reservations without generating task answers | Used in the recorded runs; sizing is not exact billing |

Wonder selection is user-controlled, with an optional inspectable rule-count heuristic for Auto mode. It is not a demonstrated accuracy advantage over Spark. Image generation is a separate explicit call and charge. No SAM 3.1 or Muse Code use is claimed.

## Server integration and architecture

| Item | Implementation |
|---|---|
| Hosting | HTML/CSS/JavaScript frontend and Node.js Vercel API functions |
| Text generation | `POST https://api.meta.ai/v1/chat/completions` |
| Input sizing | `POST https://api.meta.ai/v1/responses/input_tokens` |
| Optional image generation | `POST https://api.meta.ai/v1/images/generations` |
| Authentication | Server-side Bearer token; no key is returned to the browser or exported |
| Structured output | JSON decisions and proposals; exact source quotes are checked locally |
| Downloads | Markdown prompts, JSON registries, source maps and a Python loader/runner |

Meta hosts the models. Vercel hosts our application and its API client; we do not host model weights.

- [Context extraction and architecture logic](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/api/_advisor.js) validates literal source quotes, model choice, reservations and template paths.
- [Semantic analysis](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/api/_semantic.js) handles bounded extraction and related-rule comparison. Current extraction uses minimal reasoning and comparisons use low reasoning; historical receipts retain their actual settings and usage.
- [Reviewed test execution](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/api/_evaluation-case.js) sends selected instructions, application state and the user request to Spark. The [evaluation dispatcher](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/api/evaluation.js) preserves the public test URLs within the hosting function limit.
- [Forma demonstration API](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/api/showcase.js) runs the fictional before/after workload using the same model and settings.
- [Optional Muse Image endpoint](https://github.com/stormragemc/Promptimize/blob/main/api/architecture-image.js) accepts loaded promptbase files without project context or a design proposal and returns an image receipt if successful. It uses a validated candidate and proposal when supplied, otherwise it labels the source-only result as a concept preview.

Model output is a proposed instruction interpretation or application decision. Local code validates evidence and applies isolated simulated actions. These are not production HR operations or native model tool-call traces. Uploaded source scripts and generated architecture templates are never executed by the workbench.

## Recorded Spark behavior benchmark

The cloud experiment ran eight fixed fictional scenarios twice on each version, with alternating order, matching Muse Spark settings, a 500-token output cap and no artificial delays or automatic retries. The execution commit was `3d56897589382b7ea3cf1a7c12b4850a218752a4`. Complete receipts are in [benchmark-cloud.json](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/demo/generated/benchmark-cloud.json).

| Measurement | Original | Promptimize export |
|---|---:|---:|
| Live task calls | 16 | 16 |
| Reviewed outcomes passed | 16/16 | 16/16 |
| Total task tokens | 84,874 | 35,264 |
| Estimated task cost | $0.07688 | $0.03702 |
| Median model response time | 1.100s | 1.156s |

All 16 paired final states matched and independently passed the reviewed action/entity/state checks. Total task tokens fell 58.5%; estimated task cost fell 51.9%. Median model time increased approximately 5%; no speedup is claimed.

The successful optimizer setup was separately estimated at $0.13962. Task costs are estimates, not invoices, and exclude that setup. Earlier failures include unknown usage, so total historical spend and overall break-even are unverified. Fixed demonstration cases do not establish production-wide accuracy or an actual UIC deployment.

### Selected fields from a real Spark receipt

```json
{
  "status": "completed",
  "version": "before",
  "caseId": "U01",
  "model": "muse-spark-1.3",
  "usage": {
    "prompt_tokens": 5209,
    "completion_tokens": 69,
    "total_tokens": 5278,
    "completion_tokens_details": { "reasoning_tokens": 38 },
    "prompt_tokens_details": { "cached_tokens": 0 }
  },
  "latencyMs": 1628,
  "recordedAt": "2026-11-04T10:02:51.294Z"
}
```

Reasoning tokens are already included in completion tokens; they are not charged a second time by our estimate. Application-captured receipts support verification but are not provider-signed certificates.

## Recorded Spark context and Wonder architecture check

The successful fictional-data run at commit `e675da526e48db883f7584a5e88028c412cc8f79` completed context extraction, instruction extraction, three comparison passes and a Wonder architecture pass. The six completed receipts sum to 19,508 known tokens.

| Stage | Model | Provider-reported total tokens |
|---|---|---:|
| Context-document extraction | `muse-spark-1.3` | 1,290 |
| Instruction extraction | `muse-spark-1.3` | 3,660 |
| Related-rule comparison, three calls | `muse-spark-1.3` | 9,192 |
| Architecture proposal and starter adapter | `muse-wonder-1.0` | 5,366 |

[Full receipts and output](https://github.com/stormragemc/Promptimize/blob/87f0e73b7c0e2665b18d24ba5d1ece39cafcd167/docs/advisor-live-result.json) include the generated adapter and kit listing. The adapter received isolated syntax and passthrough checks; those do not establish production integration. This fixture's forecast showed an instruction-input increase under its chosen assumptions, which was reported rather than presented as a saving. Failed earlier attempts remain in the `docs/advisor-live-*.json` history.

## Reproduce or inspect

- Open the [saved benchmark](https://promptimize-steel.vercel.app/demo/bench.html) to inspect the primary evidence without new model calls.
- In the main workbench, upload promptbase files. Upload context documentation through the separate context controls, click **Read context with Meta**, review the source-linked facts, approve them, and analyze again. The general promptbase upload is not a context-document upload.
- Inspect Proposal and Review, freeze the candidate, prepare the bundle, build and approve a test plan, then check sizing before starting comparisons.
- For a quick image demonstration, click Load the sample, then Generate Muse Image illustration directly in Input. No context or prior analysis is required; source-only output is a concept preview. Optional architecture proposals and image generation require explicit actions. Do not automatically rerun paid experiments to inspect evidence.
- Automated verification includes deterministic Node tests and four legacy suites. They use mocked providers or local fixtures and are not additional live benchmarks.

Test inputs and routing still require review. Genuinely required missing state blocks generation rather than being guessed, and unprepared requests are not reported as zero-token savings. The saved Forma benchmark is a separate complete experiment; it does not certify every newly uploaded promptbase.

Official references: [Meta Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions) and [token counting](https://dev.meta.ai/docs/token-counting).
