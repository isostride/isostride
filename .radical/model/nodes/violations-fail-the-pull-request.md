---
id: "fefd8bec-3f3f-4a8a-92ef-ff994442c642"
type: "fitness-fn"
label: "Violations fail the pull request"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

A workflow runs npm run check:deps on every pull request; dependency-cruiser's default err reporter exits non-zero on an error-severity violation and prints the rule with the from and to files. The job is listed among the checks the main branch requires, in the ruleset the Code review and branching pack keeps.

Threshold: The dependency check runs on every pull request and its job fails on any violation, naming the rule and both files

Tool: dependency-cruiser in GitHub Actions; for the JVM: the ArchUnit tests in the build's test job

```yaml
# .github/workflows/boundaries.yml
name: module boundaries
on: [pull_request]
jobs:
  check-deps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4.2.2   # pin by commit SHA in your repository
      - uses: actions/setup-node@v4.1.0   # pin by commit SHA in your repository
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run check:deps   # depcruise src --config .dependency-cruiser.cjs; exits non-zero on a violation
```
