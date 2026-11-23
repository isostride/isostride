---
id: "d61eb6c6-1894-4c74-a00d-1d90d91e302d"
type: "requirement"
label: "Stops found by time"
action: "count a 10 s window as stopped when less than half of its time is covered by samples, each sample covering the time to the next one but no more than 10 s, or when its mean speed is under 0.5 m/s, so a run recorded every 1 to 7 s (Garmin's Smart recording) keeps its moving windows"
ears_type: "ubiquitous"
rationale: "The runner asked whether the app works with other watches (\"czy aplikacja zadziala z inymi zegarkami ? garmin itp ?\"): with Garmin's Smart recording a window held fewer than 5 samples and counted as stopped; the fix in the same change (\"W tym samym PR\"). Model's choices: a sample covers at most 10 s, so a pause of the watch (no samples) stays a stop; 0.5 m/s as before; 1 to 7 s is the model's reading of how often Smart recording records."
---
