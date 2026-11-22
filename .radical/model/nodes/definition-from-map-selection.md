---
id: "87cc4620-281c-4697-bafe-41bf44e61a99"
type: "scenario"
label: "Definition from map selection"
gherkin: "And it is saved in user/block-definitions.json"
given: "the 9 Nov run with GPS"
then: "the block is a rule taking the route as its stretch, named \"<km> km <direction>-bound, any pace\"; the run's own pass is its one segment, kept in the folder after detection"
when: "about 1 km of it (minutes 20–24) is kept as a block of the same route at any pace"
---
