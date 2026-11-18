---
id: "df81f6e6-c81a-49fc-801e-c4d030ef11ea"
type: "fitness-fn"
label: "Reproducible recompute"
cadence: "triggered"
characteristic: "reliability"
combine: "all"
invocation: "automated"
metrics: |
  recompute.derived.files_differing == 0
  recompute.user.files_changed == 0
  recompute.fit.files_changed == 0
scope: "holistic"
trigger: "pull-request"
---

Running “Recompute everything” after deleting derived/ yields byte-identical derived files and identical trend and A/B results, and leaves every file in user/ and fit/ unchanged (checksums before and after). Acceptance criterion 7.
