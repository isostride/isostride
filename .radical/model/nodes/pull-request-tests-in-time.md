---
id: "f6242d0c-671f-47c3-bab4-97c5d642bc0a"
type: "fitness-fn"
label: "Pull-request tests in time"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

The test job has a hard timeout of 10 minutes, so a slow suite fails instead of quietly growing; it is listed among the checks the main branch requires, in the ruleset the Code review and branching pack keeps.

Threshold: The pull-request test job finishes within 10 minutes

Tool: GitHub Actions (timeout-minutes) with Vitest; for the JVM: the same job running ./gradlew test

```yaml
# .github/workflows/test.yml
name: test
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4.2.2   # pin by commit SHA in your repository
      - uses: actions/setup-node@v4.1.0   # pin by commit SHA in your repository
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npx vitest run --project unit --reporter=junit --outputFile=reports/unit.xml
      - run: npx vitest run --project integration --reporter=junit --outputFile=reports/integration.xml
```
