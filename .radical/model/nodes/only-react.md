---
id: "0db10cc1-795c-4f2e-8508-33bead388cc9"
type: "fitness-fn"
label: "Only React"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A job in every build reads the dependencies and devDependencies of every package.json in the repository and fails when one names another UI framework's package; a second framework then arrives only with the decision record that allows it and a change to this check. Runs on Linux (git, jq, GNU xargs and grep).

Threshold: 0 package.json files in the repository declare @angular/core, vue, nuxt, svelte, @sveltejs/kit

Tool: git with jq and grep (CI job)

```bash
#!/usr/bin/env bash
# fails when a package.json anywhere in the repository declares another UI framework
set -euo pipefail
other=$(git ls-files -- '*package.json' | xargs -r jq -r '((.dependencies // {}) + (.devDependencies // {})) | keys[]' \
  | grep -xE '@angular\/core|vue|nuxt|svelte|@sveltejs\/kit' || true)
[ -z "$other" ] || { echo "::error::another UI framework is declared: $(tr '\n' ' ' <<<"$other")(ADR Built with React)"; exit 1; }
```
