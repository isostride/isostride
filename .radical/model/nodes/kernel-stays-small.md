---
id: "79a9693f-e282-43ff-bbfa-ae2891f4aa12"
type: "scenario"
label: "Kernel stays small"
given: "the shared kernel lib/kernel"
then: "the dependency check fails and the change is moved into the part that uses it"
when: "a change makes it import a part or a package outside its allowlist, or the kernel passes 5% of the lines"
---
