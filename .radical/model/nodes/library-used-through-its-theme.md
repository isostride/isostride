---
id: "b1707f8d-4ee5-434c-a5c1-8545b9b1c76a"
type: "requirement"
label: "Library used through its theme"
action: "style the components only through the theme's design tokens (the CSS custom properties of the light and dark theme), with 0 colours set outside them"
ears_type: "ubiquitous"
rationale: "The application has no component library (ADR Built with React, revised 19 Nov 2026): its own components are styled through its theme, so the theme is the one place a colour changes, in both the light and the dark theme."
---
