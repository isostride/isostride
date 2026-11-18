---
id: "da832a20-4c6e-48e6-9bce-d34a6396158a"
type: "requirement"
label: "Only declared dependencies"
action: "let each part depend only on the parts it declares in its module.json as allowed, with 0 undeclared dependencies between parts on the main branch outside the recorded baseline"
ears_type: "ubiquitous"
rationale: "Declaring each dependency makes it a decision visible in review; rules that are not checked erode with every shortcut (Building Evolutionary Architectures, ch. 2; Spring Modulith, allowed dependencies)."
---
