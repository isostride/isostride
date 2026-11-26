---
id: "0d840438-e0be-42d5-ae0b-a97ea6ac43de"
type: "scenario"
label: "Pipeline keeps the runner's data"
given: "the pipeline's scripts and workflow, the tests of the repository, the policy file of the two sites and the end-to-end tests' set-up"
then: "every test command of the pipeline runs through the script that keeps its output with the run's reports; the builds are handed on as artifacts and never read back from the bucket; no test compares a latitude or a longitude with a number; both sites answer with a Content-Security-Policy read from one file, the app's allowing connections to COROS alone, and the end-to-end tests run under it on a fixed day"
when: "they are read"
---
