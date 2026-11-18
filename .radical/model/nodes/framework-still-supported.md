---
id: "668193e6-22d8-49d5-a71f-1bda90dcf4d6"
type: "fitness-fn"
label: "Framework still supported"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "nightly"
---

A scheduled job and every build look up each product and cycle listed in versions.txt on endoflife.date (angular, nextjs, nuxt, vue, svelte, nodejs for the build) and fail when end of support is less than 180 days away; versions.txt changes in the same pull request as package.json. The same script serves the Backend stack pack. Runs on Linux (GNU date).

Threshold: 0 framework or build-tool majors within 180 days of their end of support

Tool: endoflife.date API (curl and jq)

```bash
#!/usr/bin/env bash
# versions.txt: "<endoflife.date product> <cycle>", e.g. "angular 20", "nodejs 24"
set -euo pipefail
LIMIT=$(( $(date +%s) + 180 * 86400 ))
fail=0
while read -r product cycle; do
  eol=$(curl -fsS "https://endoflife.date/api/${product}/${cycle}.json" | jq -r '.eol')
  [ "$eol" = "false" ] && continue
  if [ "$eol" = "true" ] || [ "$(date -d "$eol" +%s)" -lt "$LIMIT" ]; then
    echo "::error::$product $cycle reaches end of support on $eol"; fail=1
  fi
done < versions.txt
exit $fail
```
