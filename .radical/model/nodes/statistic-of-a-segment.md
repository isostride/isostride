---
id: "20280dd4-9d43-4d15-bb62-dd3ca3050e95"
type: "scenario"
label: "Statistic of a segment"
given: "a run of 6:00/km, then 4:00/km for its middle third, then 5:00/km, with heart rate 130, 170 and 150, and a run with a one-second spike of speed"
then: "the minimum pace is 4:00, the maximum 6:00, the median 5:00; the maximum heart rate 170, inside the last third 150; the spike is no minimum of pace because the statistics read the 10 s windows; a metric never recorded has no value; the block's segment carries 170 bpm by its maximum and 4:00 /km by its minimum"
when: "the minimum, maximum, median and average of pace, heart rate and efficiency are taken over the run or a stretch of it, and a block of whole runs is read by its maximum or minimum"
---
