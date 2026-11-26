---
id: "ca0e2c80-7413-474f-ba55-6b57bcd216d8"
type: "scenario"
label: "Tree checked once"
given: "the pipeline's workflow, and a bucket that holds, or does not hold, the mark of the tree of the commit"
then: "a push with the mark is checked before, the mark asked for by the tree's hash (ci/checked/<tree>); a push without it is checked whole; a pull request is checked whole and the bucket is not asked; a run started by hand follows the mark; every stage of the check is left out for a tree checked before; the verdict runs whenever the tree was not, and marks it only when every job before it passed; a tree checked before is built, and the deploy takes that build or the whole check of the run"
when: "a run asks whether its tree was checked before: on a push to master, on a pull request, on a run started by hand"
---
