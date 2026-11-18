---
id: "422370cf-5624-4397-804e-862b68fe2f68"
type: "requirement"
label: "No cycles between parts"
action: "keep the dependency graph between parts free of cycles, with 0 cycles that run through more than one part (a cycle inside one part is that part's own business)"
ears_type: "ubiquitous"
rationale: "Parts in a cycle can only be understood, tested and released together, which makes them one part (Martin, Clean Architecture: the Acyclic Dependencies Principle; ISO/IEC 25010 modularity)."
---
