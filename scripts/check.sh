#!/bin/sh
# npm run check: the whole feedback loop, locally. Every step runs even when one before it
# failed, so the report is complete; radical check then judges the tests and measurements
# against the model and exits non-zero on any error (a failed test, a metric condition
# that does not hold, a scenario or fitness function left without a check).
mkdir -p reports
rm -rf reports/measures.d reports/measures-e2e.json reports/coverage
t0=$(date +%s)
npx vitest run --coverage --reporter=default --reporter=json --outputFile=reports/vitest.json
t1=$(date +%s)
npx playwright test
t2=$(date +%s)
printf '{ "testsSeconds": %s, "e2eSeconds": %s }\n' $((t1 - t0)) $((t2 - t1)) > reports/timing.json
for step in "node scripts/boundaries.mjs" "node scripts/frameworks.mjs" "node scripts/framework-support.mjs" "node scripts/js-budget.mjs" "npx eslint lib app components workers" "node scripts/coverage-new.mjs" "node scripts/test-metrics.mjs" "sh scripts/metrics.sh"; do
  $step || echo "check: $step failed"
done
sh radical.sh check .radical/model --report reports/vitest.json --report reports/playwright.json
