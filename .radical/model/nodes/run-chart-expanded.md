---
id: "24eaa0d4-dbf7-4b7c-8229-ad197ea5829e"
type: "requirement"
label: "Run chart expanded"
action: "show the run chart on the whole screen, in full screen where the browser allows and turned on its side on a phone where it can, with the run's name, the range shown and the reverse icon that closes it; close it on that icon or Escape, keep the keyboard inside it while it is open, and give the focus back to the full-screen icon"
ears_type: "event-driven"
rationale: "The runner: \"na telfonie kiepsko to wylada.. .moze pokazuj wykresy w aspekcie rozyntoalnym? fullscreen?\", then of its button: \"popraw pozycje przycksu full screen\", \"powiniejn byc po prawej stronie ... ale w rogu wykresu ... a nie nad mapa\", \"dodaktowo ... nazwij expand\", \"tak samo jak w mapie\"; later, as every chart got the same (requirement \"Every chart on the whole screen\"), its name went from the button to its label for a screen reader and the icon became the full-screen one, closed by its reverse. The model's choices: the icon in a line of its own over the chart, with the chart's summary at the left and Clear selection beside it while a stretch is selected, so the chart does not move as a stretch is selected; where the browser cannot go full screen (an iPhone) the chart covers the page and the runner turns the phone; on a low screen the plot keeps its laps alone."
trigger: "the runner presses the full-screen icon at the top right corner of the run chart"
---
