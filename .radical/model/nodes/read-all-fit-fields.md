---
id: "7379e576-1802-487b-bc76-a9d745b2e2bd"
type: "requirement"
label: "Read all FIT fields"
action: "read from each FIT file the run (start time, source file, device, distance, duration), every sample (every 1 s, or less often on a watch that records smart) with each numeric field of its record as a metric, the standard fields of the FIT profile and the developer fields alike, named and measured as the file names them (the metrics the app knows keep their names: speed, heart rate, cadence, ground contact time, vertical oscillation, step length, power, altitude, temperature, effort pace, leg spring stiffness), the GPS position and the distance apart, leaving out the time, the running totals and the duplicates (enhanced speed and altitude read in place of speed and altitude), and the laps (start, end, duration, distance)"
ears_type: "ubiquitous"
rationale: "F2: all fields of the data model are needed for blocks and their context. The runner asked whether the app adapts to fewer or more metrics in the files (\"czy gdy metryk bedzie mniej lub wiecej w plikach to aplikacja sie dostosuje ? czy metryki sa zahardkodowane?\"), chose to make every numeric field a metric (\"chce zrobic 2\", then \"Wszystkie liczbowe\"). Model's choices: the running totals (accumulated power) and the counters left out as not a measure of the moment; a metric's key, the field's name in the FIT profile, the known ones under their names of before, so the zones, analyses and links already saved stay valid."
---
