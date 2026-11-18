---
id: "aec32856-5ea5-4f0e-8316-178aff6a9838"
type: "need"
label: "A fast, accessible front end"
kind: "brief"
source: "Hub concern pack: Frontend stack"
---

People use this front end on their own devices, browsers and networks, some with disabilities and assistive technology. It has to load and respond quickly on an ordinary phone, work in the browsers its users have, be usable by everyone, look and behave consistently, and be built on a framework the team knows and that keeps receiving fixes. The choices and the numbers it is held to must be written down and checked, not rediscovered after users complain. The checks assume one front end per repository with its package.json at the root, a versions.txt listing the endoflife.date products and cycles in use, server templates (htmx) under templates/ or src/, and a RUM table rum_events(name, value, page_group, received_at) fed by the page.
