---
id: "44d77356-e7fd-4ab0-82f4-8e0e015d2cc0"
type: "requirement"
label: "Noise threshold"
action: "compute a noise threshold for each metric and block definition as the standard deviation of the metric between runs in the same context: about the fitted line for a trend, inside the groups for an A/B"
ears_type: "ubiquitous"
rationale: "A difference below the threshold is not a result; ground contact time at a fixed pace varied by about 2–3 ms in the preliminary analysis, to be confirmed. On 26 Nov 2026 a review of the whole app (the runner's \"przegladnij aplikacje raz jeszcze ... pod katem modeli ale nie tylko\"), found the noise of a trend to be the spread of all its values, the trend included (values on a line: a band of ±3.2 bpm; the stronger the trend, the wider the band); the runner: \"tak zacznij od poczzatku ... i przejdz przez wszystkie\". Model's choices: the noise of a trend is the standard deviation of the runs' means about the fitted line (n − 2), of a series without a line the standard deviation between its instances; of an A/B the pooled standard deviation of the runs' means inside the groups."
---
