---
id: "2f46f997-ec74-405b-917b-2d3c97b3be0f"
type: "fitness-fn"
label: "No library internals styled"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
metrics: "styles.untokenized_colours == 0"
scope: "atomic"
trigger: "pull-request"
---

The application has no component library: its components are styled through its own theme, the CSS custom properties (tokens) of app/globals.css for the light and dark theme. A unit test (tests/unit/styles.test.ts) refuses a colour set anywhere but in a token: a colour literal in a CSS declaration that is not a custom property, or in a component.

Threshold: 0 colours set outside the theme's tokens

Tool: Vitest over app/globals.css and the components
