---
id: "2f46f997-ec74-405b-917b-2d3c97b3be0f"
type: "fitness-fn"
label: "No library internals styled"
cadence: "triggered"
characteristic: "maintainability"
invocation: "automated"
scope: "atomic"
trigger: "pull-request"
---

Stylelint refuses selectors with the library's internal class prefixes, so styling goes through the theme. Adjust the patterns to the library used (MUI: .Mui, Angular Material: .mat-mdc / .mdc-, PrimeNG: .p-, Bootstrap with htmx: its component classes stay, only its internal state classes are listed).

Threshold: 0 selectors targeting the component library's internal class names

Tool: Stylelint (selector-disallowed-list)

```json
{
  "rules": {
    "selector-disallowed-list": [
      ["/\\.Mui[A-Z]/", "/\\.mat-mdc-/", "/\\.mdc-/", "/::ng-deep/"],
      { "message": "Style the component library through its theme (ADR Frontend stack)" }
    ]
  }
}
```
