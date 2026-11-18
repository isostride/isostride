---
id: "443e43b6-6641-4758-a0ae-f73ca1bd3601"
type: "fitness-fn"
label: "Static export only"
cadence: "triggered"
characteristic: "compatibility"
combine: "all"
invocation: "automated"
metrics: |
  build.server_routes == 0
  build.static_routes_missing == 0
scope: "atomic"
trigger: "release"
---

The release build runs `next build` with `output: 'export'` and checks the out/ folder: every route of the six screens is a pre-built HTML file, and the build produced no server functions, API routes or middleware. The out/ folder is then opened from a plain static file server in the end-to-end run.

Threshold: 0 server-side routes or functions in the build; every screen route present as a static file
