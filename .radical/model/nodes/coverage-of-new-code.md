---
id: "fc4d5152-99b5-44ae-8ff1-2728cb8cfdf5"
type: "fitness-fn"
label: "Coverage of new code"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

The pipeline sends the coverage report to SonarQube and waits for the quality gate, whose condition "Coverage on New Code is less than 80%" is created once through the Web API, not in the properties file.

Threshold: Coverage on new code at least 80%; the quality gate fails the pull request below it

Tool: SonarQube quality gate (sonar-scanner with sonar.qualitygate.wait, the condition through api/qualitygates/create_condition; SonarQube Cloud takes gateId and organization instead of gateName); for the JVM: the same with the JaCoCo report path

```bash
# sonar-project.properties, in the repository:
#   sonar.projectKey=shop-order-api
#   sonar.sources=src
#   sonar.tests=test
#   sonar.javascript.lcov.reportPaths=coverage/lcov.info
#   sonar.newCode.referenceBranch=main
#   sonar.qualitygate.wait=true
# the gate's condition, created once (SonarQube Server; needs the Administer Quality Gates permission):
curl -fsS -u "$SONAR_TOKEN:" -X POST "$SONAR_HOST_URL/api/qualitygates/create_condition" \
  --data-urlencode "gateName=Shop" --data-urlencode "metric=new_coverage" \
  --data-urlencode "op=LT" --data-urlencode "error=80"
```
