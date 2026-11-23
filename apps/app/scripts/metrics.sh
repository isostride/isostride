#!/bin/sh
# Turns the measurements the tests record (reports/measures.json) into the
# model's metrics, for radical check. Run after the tests.
set -e
M=reports/measures.json
# Merge the measures the tests wrote one file each (reports/measures.d/<name>.json).
node -e '
const fs = require("fs"), path = require("path"), dir = "reports/measures.d";
const all = {};
if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) all[path.basename(f, ".json")] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
fs.writeFileSync("reports/measures.json", JSON.stringify(all, null, 2));
'
sense() { sh ../../radical.sh sense json "$M" --folder ../../.radical/model "$@" >/dev/null; }
sense --label fixture=sample-fit \
  --metric ingest.import.duration.max=/importMaxSeconds@s \
  --metric derived.run_file.size.max=/runFileMaxKB@KB
sense --metric recompute.derived.files_differing=/recomputeDerivedFilesDiffering \
  --metric recompute.user.files_changed=/recomputeUserFilesChanged \
  --metric recompute.fit.files_changed=/recomputeFitFilesChanged
sense --label runs=300 --metric recompute.duration=/recomputeSecondsPer300Runs@s
sense --label rule=processing-only-in-worker --metric deps.violations=/processingOnMainThreadViolations
sense --metric deps.undeclared=/depsUndeclared --metric deps.internal_access=/depsInternalAccess --metric deps.cycles=/depsCycles \
  --metric kernel.forbidden_imports=/kernelForbiddenImports --metric kernel.share=/kernelSharePercent@% --metric deps.violations_total=/depsViolations
sense --metric acceptance.recommendations.promenade_segment=/promenadeRecommended --metric acceptance.recommendations.tempo_25min=/tempoRecommended
sense --metric compare.trend.duration.max=/trendMaxSeconds@s
sense --metric compare.ab.duration.max=/abMaxSeconds@s
sense --label trials=10 --metric ab.random_split.no_change_trials=/abRandomSplitNoChangeTrials
sense --metric derived.files_without_algorithm_version=/derivedFilesWithoutVersion
sense --metric load.model_change.run_files_read=/loadModelChangeRunFilesRead
sense --metric cache.repeat.run_files_read=/cachedResultRunFilesRead --metric context.change.run_files_read=/contextChangeRunFilesRead
sense --metric import.repeat.records_added=/repeatRecordsAdded
sense --metric blocks.legacy_differing=/legacyBlocksDiffering --metric ui.block_words=/uiBlockWords --metric run.cross_run_reads=/runCrossRunReads
sense --label dataset=author --metric import.errors=/historicalImportErrors --metric import.runs_missing_developer_fields=/historicalRunsMissingDeveloperFields
# Acceptance criterion 3: a value the run could not compute (no pass in the period) is left unmeasured.
sense --metric acceptance.promenade.steady_passes=/promenadeSteadyPasses
sense --label dataset=author --metric compare.trend.changes_detected=/trendChangesDetected
sense --label expected=135 --metric acceptance.promenade.hr_2026_11_14.abs_error=/promenadeHrNov14AbsError@bpm 2>/dev/null || true
# End-to-end measurements (reports/measures-e2e.json, from npm run e2e).
E=reports/measures-e2e.json
if [ -f "$E" ]; then
  sensee() { sh ../../radical.sh sense json "$E" --folder ../../.radical/model "$@" >/dev/null; }
  # A measure a failed end-to-end test did not record stays unmeasured; the failed test is reported.
  sensee --label origin=external --metric app.network.requests=/externalRequests 2>/dev/null || true
  sensee --label origin=other-than-map-tiles --label map=on --metric app.network.requests=/mapOnOtherRequests 2>/dev/null || true
  sensee --label impact=serious-or-critical --metric a11y.violations=/a11ySeriousViolations 2>/dev/null || true
  sensee --metric e2e.keyboard_journey.completed=/keyboardJourneyCompleted 2>/dev/null || true
  sensee --metric e2e.lcp.max=/lcpMaxMs@ms --metric e2e.cls.max=/clsMax --metric e2e.tbt.max=/tbtMaxMs@ms --metric e2e.inp.max=/inpMaxMs@ms 2>/dev/null || true
  sensee --label browser=webkit --metric e2e.unsupported_browser.started=/unsupportedStarted_webkit 2>/dev/null || true
  sensee --metric build.server_routes=/buildServerRoutes --metric build.static_routes_missing=/buildStaticRoutesMissing 2>/dev/null || true
  sensee --label browser=chromium --metric e2e.supported_browser.started=/supportedStartedChromium 2>/dev/null || true
  sensee --metric performance.views.run_files_read=/performanceRunFilesRead 2>/dev/null || true
  sensee --metric layout.phone.screens_wider_than_screen=/phoneScreensWiderThanScreen 2>/dev/null || true
fi
# Test strategy (scripts/test-metrics.mjs, scripts/coverage-new.mjs, scripts/nightly.sh).
T=reports/measures-tests.json
if [ -f "$T" ]; then
  senset() { sh ../../radical.sh sense json "$T" --folder ../../.radical/model "$@" >/dev/null; }
  senset --metric tests.unit.share=/unitSharePercent@% --metric tests.e2e.share=/e2eSharePercent@% \
    --metric tests.unit.over_100ms=/unitOver100ms --metric tests.unit.network_calls=/unitNetworkCalls
  senset --metric tests.failed=/vitestFailed --metric tests.skipped=/vitestSkipped
  senset --metric e2e.failed=/e2eFailed --metric e2e.skipped=/e2eSkipped 2>/dev/null || true
  senset --metric tests.duration=/testsSeconds@s 2>/dev/null || true
fi
[ -f reports/measures-coverage.json ] && sh ../../radical.sh sense json reports/measures-coverage.json --folder ../../.radical/model --metric coverage.new_code=/newCodeCoveragePercent@% >/dev/null
[ -f reports/measures-nightly.json ] && sh ../../radical.sh sense json reports/measures-nightly.json --folder ../../.radical/model \
  --metric tests.shuffled_runs.failed=/shuffledRunsFailed --metric tests.flaky.unquarantined=/flakyUnquarantined >/dev/null
sense --metric quarantine.overdue=/quarantineOverdue --metric quarantine.incomplete=/quarantineIncomplete
sense --metric e2e.journeys.covered=/journeysCoveredPercent@%
# Frontend stack.
sense --metric fixtures.load_errors=/fixturesLoadErrors --metric fixtures.without_expected_values=/fixturesWithoutExpectedValues
sense --metric compat.violations=/compatViolations --metric ui.other_frameworks=/otherFrameworks --metric styles.untokenized_colours=/untokenizedColours
[ -f reports/measures-js.json ] && sh ../../radical.sh sense json reports/measures-js.json --folder ../../.radical/model --metric js.route.transfer.max=/scriptMaxKB@KB >/dev/null
[ -f reports/measures-eol.json ] && sh ../../radical.sh sense json reports/measures-eol.json --folder ../../.radical/model --metric framework.near_eol=/frameworksNearEol >/dev/null
echo "metrics recorded"
