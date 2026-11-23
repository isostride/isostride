---
id: "564584c7-63b4-467a-a057-2ccd77cc6fe2"
type: "requirement"
label: "Run chart second by second"
action: "draw the run chart's lines second by second from the file's records, to the run's first and last record with a value, leaving out only standing (under 0.5 m/s), pauses without records and the 5 s on either side of them, the lowest and highest values of a selection taken from the seconds"
ears_type: "ubiquitous"
rationale: "The runner asked: \"nie podoba mi sie koncowka ... brak te,pa ? w corosie wyglada norlanie\" (the last record of a COROS run had no speed, its 10 s window counted as a stop and hid the 10 s before it), then \"w coros widze metryke co 1 sekunde ... czemu piszesz o 10s ?\", answered \"1 s on the chart\": Raw draws every second as in COROS; segments, comparisons and models stay on 10 s windows. The model's choices: standing is a speed under 0.5 m/s, as for the windows (lib/prepare, STOPPED_SPEED); 5 s left out on either side of standing or a pause (slowing down, speeding up), as the windows on either side of a stop were; a second without a value is no stop."
---
