---
id: "7d6b12f4-6f67-4179-bdba-18d135ea871c"
type: "fitness-fn"
label: "Shared kernel stays small"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A dependency rule keeps the kernel free of the parts and of every package in node_modules except the pure ones on its allowlist (so a database driver, HTTP client or framework cannot slip in); a second step in the same job compares the kernel's line count with the whole and fails above the limit.

Threshold: The shared kernel imports no part and no third-party package outside its allowlist, and holds at most 5% of the source lines

Tool: dependency-cruiser and cloc with jq in a shell step; for the JVM: an ArchUnit rule over the kernel package and JaCoCo's line counts

```js
// .dependency-cruiser.cjs: add the rule to forbidden
module.exports = { forbidden: [{
  name: 'kernel-depends-on-nothing',
  comment: 'ADR A small shared kernel: types and contracts only',
  severity: 'error',
  from: { path: '^src/shared-kernel/' },
  to: { path: ['^src/modules/', '^node_modules/'], pathNot: '^node_modules/(zod|uuid|decimal\\.js)/' },   // the pure libraries the kernel may use
}] }
// CI, in the same job: fail when the kernel passes the limit
//   kernel=$(cloc --json src/shared-kernel | jq '.SUM.code'); all=$(cloc --json src | jq '.SUM.code')
//   [ $((kernel * 100 / all)) -le 5 ]
```
