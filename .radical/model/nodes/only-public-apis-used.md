---
id: "d70ace61-b027-43c3-93cb-4df7cfb1b3a9"
type: "fitness-fn"
label: "Only public APIs used"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A dependency rule allows a part to import another only through its index (the published API); a deep import into another part's folder fails the build. Spring Modulith's verify() (named interfaces such as customer::api are its published packages) and Nx's module boundaries do the same in their stacks.

Threshold: 0 imports from one part into another part's files other than its index.ts

Tool: dependency-cruiser; for Spring Boot: Spring Modulith verify(); for an Nx workspace: @nx/enforce-module-boundaries; for .NET: NetArchTest

```js
// .dependency-cruiser.cjs: add the rule to forbidden
module.exports = { forbidden: [{
  name: 'only-through-public-api',
  comment: 'ADR Module boundaries: parts meet through their published API',
  severity: 'error',
  from: { path: '^src/modules/([^/]+)/' },
  to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
}] }
```
