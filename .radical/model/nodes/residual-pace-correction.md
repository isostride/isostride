---
id: "b0289efc-ad5a-46b3-b57d-9abbb703ae9a"
type: "requirement"
label: "Residual pace correction"
action: "after strict matching, apply a model (linear regression) correction only for the residual pace difference, and show every result in both versions: raw and corrected"
ears_type: "ubiquitous"
rationale: "Second step of a comparison. On 26 Nov 2026 a review of the whole app (the runner's \"przegladnij aplikacje raz jeszcze ... pod katem modeli ale nie tylko\"), found the slope on pace fitted over both groups of an A/B together, so a difference between the groups that goes with a difference of pace was taken away as the effect of pace (+5 bpm read +0.4), fitted over the months of a trend, so the trend itself was taken away with the pace that improved, and applied to effort pace, itself a pace; the runner: \"tak zacznij od poczzatku ... i przejdz przez wszystkie\". Model's choices: in an A/B the slope inside the groups (each centred on its own means); in a trend the slope of pace beside time, fitted together, and no correction when pace and time cannot be told apart; every pace metric (pace, effort pace) left as it is. On 26 Nov 2026 a third review (the runner: zmergowane, zrob kolejna iteracje) found that the interval of what is compared left out what the correction costs: the metric is now fitted on what is compared (the group, or the day) and on the pace together, the run the unit, and the interval comes from that fit."
---
