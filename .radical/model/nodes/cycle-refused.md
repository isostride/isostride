---
id: "e47a11bd-a986-4f7d-9a36-7e5d35a88365"
type: "scenario"
label: "Cycle refused"
given: "two parts where detection depends on blocks"
then: "the dependency check reports the cycle with both parts named and npm run check fails"
when: "a change makes blocks depend on detection"
---
