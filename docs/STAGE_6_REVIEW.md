# Stage 6: motion and guided walkthrough

This checkpoint adds the owner's requested loading animations, animated download-page measurements, tutorial cards and idle next-action cues. The original review, budget and frozen-candidate contracts remain intact. PR #2 stays unmerged; production has not been promoted.

## Try the real preview

1. Open the feature Preview and scroll down. First-time visitors get a nine-card tutorial. Back, Next, Skip, Escape and the close button work; replay is the fixed paper-plane button at the top right. Preferences survive reload when local storage is available.
2. The tour spotlights a real control when available. Later locked steps show an explicitly labelled preview and the actual workflow navigation location. It never inserts files, approves work, runs comparisons or spends tokens. “Show this step” closes the tour and focuses/scrolls to that part of the workbench.
3. Load the sample and click Analyze bundle. A violet/pink folded-paper plane follows a loop, alongside the actual operation description and elapsed time. It also covers file reads, saves, bundle checks, plan creation/approval, sizing, comparisons and ZIP preparation. Very fast work avoids a loading flash. Loops pause offscreen or when the document is hidden. No invented completion percentage or stage progress is displayed.
4. Pause for 18 seconds at a ready action. One arrow and breathing highlight identify the next available control. If it is offscreen, Show me scrolls to it; the cue never clicks it. Editing, running work, hidden tabs and dialogs suppress hints. Dismiss the current hint, or disable Next-step hints in the guide. Review/approval prompts explicitly ask the human to review first.
5. After a complete paired run, the download page shows task-token difference, observed reviewed-case pass rate, median response time and estimated task cost. Numbers animate once per report when visible, then remain exact. Latency and cost can decrease from the old measurement to the new one. Unknown measurements are never animated from a fabricated zero. Increases remain red; decreases green; unknown usage neutral. Pass rate is evidence for these cases, not a claim of general accuracy.

## Isolated visual fixture

`/tests/browser/experience-fixture.html` is a clearly watermarked synthetic UI test page. Its example receipts and measurements are invented. They are **not** a Meta benchmark or a savings claim.

The parent loads the current root UI assets using its existing authenticated origin. It embeds them in an opaque sandboxed iframe with independent in-memory session/preferences. Its fetch stub permits only a delayed synthetic analysis result and rejects other calls. It neither calls the model nor overwrites a real workbench session. Refreshing restarts the fixture. Rebuild after source/template changes:

```sh
node tests/browser/build-experience-fixture.cjs
```

Use it to check Downloads counters, recorded state-match celebration, replay, Upload another, loading cleanup and next-action hints without paid requests. Model/backend behavior is covered separately by the existing tests.

## Verification

- 57 Node tests pass, including five guidance/measurement tests and the existing full regression interaction with DOM/provider doubles.
- Four legacy suites pass: contract, JD adapter, review/export and simulation.
- JavaScript syntax checks pass. Static IDs remain unique.
- Authenticated Chrome access became available in this session. The actual Preview completed a live Meta sample analysis and displayed the loading flight. That particular semantic result conservatively retained all five source blocks in `shared`; it did **not** establish useful routing or token savings. No full live comparison benchmark was run, and no live private UIC accuracy claim is made.
- Browser checks exercised all nine tutorial cards, first-scroll launch, replay, skip, visible bottom controls on a short desktop viewport, 390×844 mobile layout without horizontal overflow, a highlighted control clear of the card, the idle cue, synthetic finish metrics, and the existing passing-state trace celebration. Synthetic counters/state replay are not live provider evidence.
- Reduced motion is implemented in CSS/JS: static flight, no breathing/travelling pointer, immediate final numbers and reduced navigation movement. OS-level preference switching was not automated in the browser.

## Code

- `experience-model.js`: pure guidance decisions, tutorial content and receipt-based finish stats. UMD for browser and Node.
- `experience.js`: additive wrappers around the existing `post`, comparison/export handlers, navigation, file reset and finish rendering. Native tutorial dialog/focus restoration, responsive spotlight positioning, preference storage, intersection-gated counters, loading lifecycle and idle cue. No dependency or model calls added.
- `index.html`, `styles.css`: theme-matched controls, plane geometry, dialogs, motion and responsive styles.
- `tests/backend/experience.test.cjs`: gate sequencing, budget/running/editor suppression, higher-cost/failing/unknown metrics and walkthrough contract.
- `docs/stage-6-tests.tap`: latest automated output.

Before the actual showcase, review real source routing and run a bounded representative suite. A ready deployment and attractive UI do not establish semantic accuracy or savings. Keep the frozen draft unchanged when a test fails; investigate and carry findings into a new proposal.
