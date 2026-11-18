---
id: "4050830f-77be-4448-b5e1-7f84e38459d5"
type: "step"
label: "Import each new file"
children: "sequence"
condition: "for each FIT file in fit/ not yet listed in manifest.json"
order: 2
repeat: "0..n"
---
