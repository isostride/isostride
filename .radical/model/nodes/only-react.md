---
id: "0db10cc1-795c-4f2e-8508-33bead388cc9"
type: "fitness-fn"
label: "Only React"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "ui.other_frameworks == 0"
scope: "atomic"
trigger: "pull-request"
---

scripts/frameworks.mjs (npm run check) and a unit test read the dependencies and devDependencies of every package.json in the repository and fail when one names another UI framework's package (@angular/core, vue, nuxt, svelte, @sveltejs/kit, solid-js, preact, lit, ember-source, @builder.io/qwik), unless an accepted decision record names that package.

Threshold: 0 package.json files in the repository declare another UI framework without an accepted decision record

Tool: scripts/frameworks.mjs
