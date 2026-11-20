---
id: "1d96c647-cd03-485d-9f23-63e8b54e8571"
type: "scenario"
label: "Pace curve drawn for blocks"
given: "two blocks on the Analysis screen, the fastest 10 minutes since 1 March and the whole runs since 1 March"
then: "a Pace curve chart appears with one line per block, drawn from the block's segments, time on the x axis and pace on the y axis, and the link carries tab=curve; each block's estimate is drawn dashed, with its parameters under the chart (the exponent, critical speed, D′ and the predicted 5 km, 10 km, half and marathon times), the fastest 10 minutes reaching their 10-minute best and so an estimate; each best has a stroke to the estimate and the pointer over the chart reads the estimate at that length; the table of bests lists each best with its estimate and gap, the pointer over a row rings its point, and Open run opens that run with the stretch selected; with Power a Power curve chart appears in watts, the link carries curve=power, and the parameters give critical power, W′ and the estimated power at 5, 20 and 60 minutes"
when: "the runner opens the Pace / power curve tab (Speed), then chooses Power"
---
