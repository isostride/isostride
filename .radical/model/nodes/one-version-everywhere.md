---
id: "3ac5135d-0963-4827-8aef-5e08635bb409"
type: "fitness-fn"
label: "One version everywhere"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

The version of the root package.json is the one the app shows, the site's footer shows and every file written to .isostride/ records; the package files and the lock file hold it alike, the changelog has its notes, the release command and the deploy's tag follow it.

Threshold: every test of the version passes

Tool: tests/unit/version.test.ts, tests/integration/release.test.ts, e2e/site.spec.ts
