---
id: "67c05609-df7a-4838-bc6b-0180d42142d6"
type: "adr"
label: "Results cached by a data stamp"
alternatives: |
  1. A cache in the browser's memory only: lost on every reload and between tabs, and the first open of each session still reads every run.
  2. Invalidating cache entries one by one by the runs they read: finer, but a change of context touches every run's segments, and the bookkeeping is more than the gain.
  3. Precomputing every rule's segments at import: the rules live in links and are built on the fly, so there is no list of them to precompute.
consequences: "A second open of Analysis, or of its curve, reads one file. Any change of the data recomputes on the next request, not before. derived/cache/ may grow with the rules tried until the next change; it is dropped with it. Recompute gives a new stamp, so the stamp and the cache are left out of the comparison of derived results."
context: "Analysis computed the segments of its rule blocks (All runs, opened by default) and the curves from every run file each time it opened, and a change of gear, tags or the load model detected every block again from every run file. The runner wants each computed once and cached, denormalized where it helps."
date: "2026-11-21"
decision: "A data stamp in derived/stamp.json names the state of the runs and their context; it changes after an import with new runs, a change of the blocks, and a change of gear, tags or the load model, and a change drops derived/cache/. The Processing Worker answers a request for a rule's segments or for curves from derived/cache/<kind>-<hash of the request>.json when its stamp and request match, else computes, writes and answers. A change of context re-joins the index, then compares the detection fields (title, workout type, cue, shoes, heart rate source) before and after: detection runs again only when a workout type changed (tag blocks, the suggestions) or a field a kept rule filters by; otherwise the context is written into the kept instances, which carry it denormalized."
status: "accepted"
---
