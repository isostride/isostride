---
id: "f81ab94c-a0cd-46bd-a65e-743f1e67144e"
type: "scenario"
label: "Version shown and recorded"
given: "the version 0.1.0 in the root package.json"
then: "the app's and the site's package.json and the lock file hold the same version; the changelog has its notes; it shows as 0.1 under the logo and in Settings, Display, with a link to the release notes of the version, and in the site's footer with the same link; every object written to .isostride/ holds app with the version and the commit; an array is written as it is"
when: "the app is built and writes its files"
---
