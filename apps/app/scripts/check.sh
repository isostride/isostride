#!/bin/sh
# npm run check: the whole feedback loop. Every step runs even when one before it failed, so the
# report is complete; radical check then judges the tests and measurements against the model and
# exits non-zero on any error (a failed test, a metric condition that does not hold, a scenario or
# fitness function left without a check). The check fails too when any step before it failed
# (every violation fails the build).
#
# Locally it runs every stage one after the other. The pipeline runs the stages as jobs side by side
# (.github/workflows/deploy.yml) and gathers their reports for the verdict:
#   sh scripts/check.sh tests      unit and integration tests (with coverage)
#   sh scripts/check.sh e2e [i/n] [project]  the end-to-end tests, or shard i of n of them, of one
#                                  browser project (chromium, webkit) or all
#   sh scripts/check.sh static     boundaries, frameworks and their support, lint
#   sh scripts/check.sh verdict    the script budget, the coverage of new code, the test metrics,
#                                  the model's metrics, and radical check
stage=${1:-all}
mkdir -p reports
failed=0
run() { "$@" || { echo "check: $* failed"; failed=1; }; }

if [ "$stage" = all ] || [ "$stage" = tests ]; then
  rm -rf reports/measures.d reports/coverage
  # The speed of this machine against the reference one: the 100 ms rule scaled by it.
  run node scripts/machine-speed.mjs
  # Unit tests alone, without coverage instrumentation: their times for the 100 ms rule.
  run npx vitest run --project unit --reporter=dot --reporter=json --outputFile=reports/vitest-unit.json
  run node scripts/machine-speed.mjs again
  t0=$(date +%s)
  run npx vitest run --coverage --reporter=default --reporter=json --outputFile=reports/vitest.json
  printf '{ "testsSeconds": %s }\n' $(($(date +%s) - t0)) > reports/timing-tests.json
fi

if [ "$stage" = all ] || [ "$stage" = e2e ]; then
  rm -f reports/measures-e2e.json
  t0=$(date +%s)
  if [ -n "${2:-}" ]; then
    # A shard: its report as a blob, merged with the others' by the verdict.
    rm -rf reports/blob
    PLAYWRIGHT_BLOB_OUTPUT_DIR=reports/blob run npx playwright test --shard="$2" ${3:+--project="$3"} --reporter=list,blob
  else
    run npx playwright test
  fi
  printf '{ "e2eSeconds": %s }\n' $(($(date +%s) - t0)) > reports/timing-e2e.json
fi

if [ "$stage" = all ] || [ "$stage" = static ]; then
  run node scripts/boundaries.mjs
  run node scripts/frameworks.mjs
  run node scripts/framework-support.mjs
  run npx eslint lib app components workers
fi

if [ "$stage" = all ] || [ "$stage" = verdict ]; then
  node -e '
const fs = require("fs");
const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {});
fs.writeFileSync("reports/timing.json", JSON.stringify({ ...read("reports/timing-tests.json"), ...read("reports/timing-e2e.json") }));
'
  run node scripts/js-budget.mjs
  run node scripts/coverage-new.mjs
  run node scripts/test-metrics.mjs
  run sh scripts/metrics.sh
  run sh ../../radical.sh check ../../.radical/model --report reports/vitest.json --report reports/playwright.json
fi

exit $failed
