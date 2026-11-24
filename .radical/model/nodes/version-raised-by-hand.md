---
id: "f266c9f7-6a1e-4cb1-85d6-66de049e38e4"
type: "requirement"
label: "Version raised by hand"
action: "set the version (e.g. 0.2) in every package.json, move the changelog's unreleased notes under that version and its date, and, once merged and deployed from master, tag the commit v<version> (e.g. v0.2) with a GitHub release of those notes"
ears_type: "event-driven"
rationale: "The runner chose: \"By hand, release notes (Recommended): You decide when it is 0.2: one command bumps package.json, adds a CHANGELOG entry and a git tag v0.2 on merge\"."
trigger: "the runner raises the version with the release command"
---
