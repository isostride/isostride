---
id: "849939df-4bd6-415e-b844-a5d5a27b1425"
type: "fitness-fn"
label: "No dependency cycles"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A dependency rule fails on any cycle that leaves a part's folder (a cycle among the files of one part is not counted); it is one of the rules in .dependency-cruiser.cjs that npm run check:deps runs. On the JVM the same is ArchUnit's slices().matching("..(*)..").should().beFreeOfCycles(); for Python, import-linter's independence contract.

Threshold: 0 cycles that run through more than one part on the main branch

Tool: dependency-cruiser; for the JVM: ArchUnit slices; for Python: import-linter; for .NET: NetArchTest

```js
// .dependency-cruiser.cjs: add the rule to forbidden
module.exports = { forbidden: [{
  name: 'no-cycles-between-parts',
  comment: 'ADR Module boundaries: parts in a cycle are one part',
  severity: 'error',
  from: { path: '^src/modules/([^/]+)/' },
  to: { circular: true, via: { pathNot: '^src/modules/$1/' } },   // the cycle passes through another part
}] }
// package.json: "check:deps": "depcruise src --config .dependency-cruiser.cjs"
```
