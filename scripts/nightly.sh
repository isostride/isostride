#!/bin/sh
# Nightly run (FFs "Tests pass in any order" and "Flaky tests enter quarantine"): the suite
# three times in random order with a different seed each, a failed test retried once to tell
# a flake from a failure. Writes reports/measures-nightly.json for scripts/metrics.sh.
mkdir -p reports
rm -f reports/flaky.json
failed=0
for run in 1 2 3; do
  seed=$(node -e 'console.log(Math.floor(Math.random() * 1e9))')
  echo "nightly run $run, seed $seed"
  npx vitest run --sequence.seed="$seed" --retry=1 --reporter=default --reporter=./tests/support/flakyReporter.ts || { failed=$((failed + 1)); echo "run $run failed: reproduce with --sequence.seed=$seed"; }
done
node -e '
const fs = require("fs");
const flaky = fs.existsSync("reports/flaky.json") ? JSON.parse(fs.readFileSync("reports/flaky.json", "utf8")) : [];
const q = JSON.parse(fs.readFileSync("quarantine.json", "utf8"));
const m = { shuffledRunsFailed: Number(process.argv[1]), flakyTests: flaky.length, flakyUnquarantined: flaky.filter((t) => !q.some((e) => e.test === t)).length };
fs.writeFileSync("reports/measures-nightly.json", JSON.stringify(m, null, 2));
console.log(m);
' "$failed"
node scripts/framework-support.mjs || echo "framework support: see above"
sh scripts/metrics.sh
[ "$failed" -eq 0 ]
