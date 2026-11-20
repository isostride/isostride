---
id: "d4a34021-26c1-48ed-8a79-3dc483b373c7"
type: "scenario"
label: "Runs matched by a search"
given: "a 10 km tempo run titled \"COROS test\" on Wednesday 14 October 2026 in Shoes A with a note \"windy\", and an easy 5 km run on 2 November 2026"
then: "\"coros test\", \"october windy\", \"2026-10\", \"wednesday\" and \"shoes a\" find the tempo run only (\"coros\" alone finds both, as both watches are COROS); the type tempo finds it, the type easy the other; 8–12 km finds the tempo run, from 4 km both, up to 6 km the easy one; an empty search finds both; \"october easy\" finds neither; the search goes into a link and back unchanged"
when: "they are matched against searches"
---
