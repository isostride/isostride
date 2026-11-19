---
id: "20280dd4-9d43-4d15-bb62-dd3ca3050e95"
type: "scenario"
label: "Statistic of a run"
given: "a run of 6:00/km, then 4:00/km for its middle third, then 5:00/km, with heart rate 130, 170 and 150, and a run with a one-second spike of speed"
then: "the minimum pace is 4:00, the maximum 6:00, the median 5:00; the maximum heart rate 170 and its median 150; the spike is no minimum of pace because the statistics read the 10 s windows; a metric never recorded has no value; the link says stat=max and the words say maximum heart rate"
when: "the minimum, maximum, median and average of pace, heart rate and efficiency are taken, and a question with the maximum is written into the link"
---
