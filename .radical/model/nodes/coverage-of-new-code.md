---
id: "fc4d5152-99b5-44ae-8ff1-2728cb8cfdf5"
type: "fitness-fn"
label: "Coverage of new code"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "coverage.new_code >= 80 %"
scope: "atomic"
trigger: "pull-request"
---

Vitest measures coverage of the processing code (lib/ and workers/, the main-thread lib/client excepted) with @vitest/coverage-v8, branches included; scripts/coverage-new.mjs takes the lines changed since the last commit (or, with a clean tree, in the last commit) and computes the share of their statements and branches the tests run, listing each uncovered line. Local only for now (the author's decision of 19 Nov 2026): npm run check runs it with the tests and exits non-zero on a failure.

Threshold: at least 80% of new and changed statements and branches covered

Tool: Vitest with @vitest/coverage-v8 and scripts/coverage-new.mjs (git diff against HEAD)
