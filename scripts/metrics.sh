#!/bin/sh
# Turns the measurements the tests record (reports/measures.json) into the
# model's metrics, for radical check. Run after the tests.
set -e
M=reports/measures.json
sense() { sh radical.sh sense json "$M" --folder .radical/model "$@" >/dev/null; }
sense --label fixture=sample-fit \
  --metric ingest.import.duration.max=/importMaxSeconds@s \
  --metric derived.run_file.size.max=/runFileMaxKB@KB
sense --metric recompute.derived.files_differing=/recomputeDerivedFilesDiffering \
  --metric recompute.user.files_changed=/recomputeUserFilesChanged \
  --metric recompute.fit.files_changed=/recomputeFitFilesChanged
sense --label runs=300 --metric recompute.duration=/recomputeSecondsPer300Runs@s
sense --label rule=processing-only-in-worker --metric deps.violations=/processingOnMainThreadViolations
sense --metric acceptance.recommendations.promenade_segment=/promenadeRecommended --metric acceptance.recommendations.tempo_25min=/tempoRecommended
sense --metric compare.trend.duration.max=/trendMaxSeconds@s
sense --metric compare.ab.duration.max=/abMaxSeconds@s
sense --label trials=10 --metric ab.random_split.no_change_trials=/abRandomSplitNoChangeTrials
# End-to-end measurements (reports/measures-e2e.json, from npm run e2e).
E=reports/measures-e2e.json
if [ -f "$E" ]; then
  sensee() { sh radical.sh sense json "$E" --folder .radical/model "$@" >/dev/null; }
  sensee --label origin=external --metric app.network.requests=/externalRequests
  sensee --label browser=webkit --metric e2e.unsupported_browser.started=/unsupportedStarted_webkit
  sensee --label browser=chromium --metric e2e.supported_browser.started=/supportedStartedChromium
fi
echo "metrics recorded"
