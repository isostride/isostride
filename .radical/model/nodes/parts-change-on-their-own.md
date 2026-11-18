---
id: "599b3f04-be13-49e5-bcba-032b2680a58e"
type: "need"
label: "Parts change on their own"
kind: "brief"
source: "Hub concern pack: Module boundaries"
---

The code in this element must stay easy to understand, test and change as it grows and as people come and go. That needs parts with clear boundaries: a change to one part should not ripple through the others, each part should be testable on its own, and the rules about what may depend on what should hold because the build checks them, not because everyone remembers them. The checks below share one layout: each part lives in src/modules/<name> with its published API in src/modules/<name>/index.ts and its declarations in src/modules/<name>/module.json; shared code, where allowed, lives in src/shared-kernel; the rules are in .dependency-cruiser.cjs and run as `npm run check:deps` (depcruise src --config .dependency-cruiser.cjs); known violations, where frozen, are in .dependency-cruiser-known-violations.json.
