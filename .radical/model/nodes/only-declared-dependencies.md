---
id: "5205b562-e8af-470c-910c-17248e62e3aa"
type: "fitness-fn"
label: "Only declared dependencies"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

Each part declares what it may use in src/modules/<name>/module.json; the configuration reads the files and generates one forbidden rule per part that allows imports only of the declared parts' index files. A new dependency means a one-line change to module.json, visible in review.

Threshold: 0 dependencies from a part on a part its module.json does not list

Tool: dependency-cruiser; for Spring Boot: Spring Modulith @ApplicationModule(allowedDependencies) with ApplicationModules.verify(); for Python: import-linter forbidden contracts

```js
// .dependency-cruiser.cjs — each part declares what it may use in src/modules/<name>/module.json: { "uses": ["catalog", "customer"] }
const { readdirSync, readFileSync } = require('node:fs')
const parts = readdirSync('src/modules')
const uses = Object.fromEntries(parts.map((p) => [p, JSON.parse(readFileSync(`src/modules/${p}/module.json`, 'utf8')).uses ?? []]))

module.exports = {
  forbidden: parts.map((p) => ({
    name: `${p}-uses-only-declared-parts`,
    comment: 'ADR Declared dependencies only: add the part to module.json to use it',
    severity: 'error',
    from: { path: `^src/modules/${p}/` },
    to: { path: '^src/modules/', pathNot: [`^src/modules/${p}/`, ...uses[p].map((u) => `^src/modules/${u}/index\\.ts$`)] },
  })),
  options: { tsConfig: { fileName: 'tsconfig.json' } },
}
```
