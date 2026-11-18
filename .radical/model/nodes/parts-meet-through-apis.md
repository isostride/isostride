---
id: "a24ee5df-9ebc-4224-93fc-0e9e323247f4"
type: "requirement"
label: "Parts meet through APIs"
action: "let a part use another only through that part's published API (its index.ts), with 0 imports of another part's internal files"
ears_type: "ubiquitous"
rationale: "A part whose internals others reach into cannot change them alone, and cannot later be extracted (Fowler, BoundedContext; Spring Modulith, application modules)."
---
