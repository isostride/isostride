---
id: "db3a5634-f1c1-4459-b810-53b37c39c7c5"
type: "requirement"
label: "COROS fetch stopped kept"
action: "keep and import the files fetched until then, say why the fetch stopped in COROS's words, and fetch the rest at the next fetch"
ears_type: "unwanted-behaviour"
rationale: "COROS caps file downloads at 50 a day for a user (\"The limits\" in the model's answer to \"coros ma mcp api ...\"); a first fetch of a long history may need several days. Model's choices: the day of the last full fetch moves only when a fetch ends without a refusal; a refused authorization asks the runner to connect again."
unwanted_condition: "COROS refuses a file or a call during a fetch (its limit of 50 files in 24 h reached, a run still in progress, the account no longer allowed)"
---
