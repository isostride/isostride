---
id: "b80c32c6-ab07-46e6-9b3a-92e7c6d4b40a"
type: "requirement"
label: "Computed once and cached"
action: "compute what it derives from the run files once for the data as it is — the segments of a block built from a rule and the curves — keep it in the data folder and read it back while the runs and their context stay the same, and write a change of gear, tags or the load model into the segments kept without detecting them again unless that change can change what detection finds"
ears_type: "ubiquitous"
rationale: "The runner said: \"widze ze czesto rzeczy sa przeliczane, chce aby rpzeliczanie bylo raz i dane cache-owane\" and \"i denormalizowane jesli trzeba\". Model's choices: the cache in derived/cache/ keyed by the request, under a data stamp in derived/stamp.json that changes with an import of new runs and with every change of gear, tags, the load model or the blocks (the whole cache dropped then); detection run again only for a change of a workout type or of a field a kept rule filters its runs by; the context of each segment denormalized from the index of runs."
---
