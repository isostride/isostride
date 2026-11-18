---
id: "b277147e-4dc1-40fe-8a58-9004d82b2740"
type: "requirement"
label: "Shared kernel stays small"
action: "keep in the shared kernel only types and contracts used by at least two parts, with no dependency on a part and no third-party library beyond the allowed pure ones, at most 5% of the source lines, and changes approved by the owners of every part that uses it as the Code review and branching pack decides ownership"
ears_type: "ubiquitous"
rationale: "A shared kernel is shared on purpose and kept small; a growing \"common\" folder couples everything to everything (Evans, Domain-Driven Design, Shared Kernel)."
---
