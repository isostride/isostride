---
id: "b1707f8d-4ee5-434c-a5c1-8545b9b1c76a"
type: "requirement"
label: "Library used through its theme"
action: "style the component library only through its theme and public props, with 0 overrides of its internal class names, so that it can be upgraded to each new major within 6 months"
ears_type: "ubiquitous"
rationale: "Overrides of a library's internals break on its next major and pin the front end to an old version (the library's own theming guides)."
---
