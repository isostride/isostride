---
id: "e59886da-dd99-4f9a-a722-ee9026468a35"
type: "requirement"
label: "Recommend route segment"
action: "propose a route segment block definition for it, with origin \"recommendation\""
ears_type: "event-driven"
rationale: "F9; acceptance: the seaside promenade segment (about 1.1 km) is proposed without hints. The origin value \"recommendation\" is the model's naming of BlockDefinition's origin field (manual, recommendation). Only passes that meet the matching conditions count (the author's report of 19 Nov 2026: a suggested block whose passes were all rejected left the Trend empty)."
trigger: "the system finds at least 5 instances of a route segment that meet its matching conditions"
---
