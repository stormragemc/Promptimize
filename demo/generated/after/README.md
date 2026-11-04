# Promptimize export

Original source quotes remain in the review record. Candidate text may include explicit human corrections. Scope assignments require review. Classification tests are not a guarantee of production behavior.

Run: python loader.py '{"jd_evaluation_results_modal_open": true}'

Unknown UI state conservatively loads every module. The original Gateway classifier/composer was not included in the upload; integrate this loader explicitly.

The semantic runtime reads routing metadata from runtime.json and instruction text from the actual module Markdown files. It verifies the manifest snapshot, module hashes, rule markers and duplicate copies before running. If a file was edited, return to Review in Promptimize, save the correction, freeze a new candidate and export it again. Do not edit runtime hashes to bypass review: existing test results apply only to the frozen export. Missing required state or evidence stops generation. Review metadata and the source map retain original evidence and approved consolidation aliases.

## Run a real request

Python 3.10+, standard library only. Configure MODEL_API_KEY in your shell; no key is embedded.

Dry run: python run.py --case U01 --dry-run

Live candidate: python run.py --case U01

Live baseline: python run.py --case U01 --mode baseline

The runner sizes input before generation, enforces a per-call token allowance, and does not retry. Tool-state simulation runs in the web workbench.
