---
id: "0314585b-4250-4c14-b64c-f07e032051e6"
type: "scenario"
label: "Wizard on the first launch"
given: "a folder with one FIT file, nothing set in it"
then: "the Welcome screen shows the steps Data folder, Your runs, You, Zones, Gear, Load model, Display, Done, the first current, under \"Choose your data folder\", with no serious accessibility violation; the folder chosen, the wizard goes on by itself, the data folder done, again with no serious violation; the run is imported; the zones show in the groups Heart rate and pace, Power, Running form and Other, the ground contact time 218, 249, 278, 309 and the vertical oscillation 64, 82, 98, 116 by default; the heart rate zones read 113, 132, 150, 169, the power zones four boundaries; the shoes are listed; the wrong pace holds the step; the display step shows the theme and the run chart's lines; the summary shows 1 run, 52 bpm, 188 bpm, the zones, 1 shoes and 0 straps, rTSS; saved, the Dashboard opens, the settings hold the load model, the threshold pace, the heart rates and the zones, the gear the shoes, the folder that the wizard was done; opened again from Settings it shows 52 bpm; skipped, the Dashboard opens"
when: "the runner chooses it, imports the file in the wizard, enters 52 and 188 bpm, fills the heart rate zones from the maximum and the power zones from the critical power, adds a pair of shoes, chooses rTSS with a threshold pace of 4:10 (a wrong 4:1 first), looks at the display step and saves, then opens the wizard from Settings and skips it"
---
