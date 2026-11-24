---
id: "a4b5c657-99ae-490c-89ba-79da8f76da5e"
type: "requirement"
label: "Data tab first in Settings"
action: "show the Data tab, the first tab of Settings and the one /settings opens on (Dane in Polish; /data and /folder leading on to it), which names the folder, says what it holds (its runs, the FIT files read, the duplicates, the files that could not be read, the first and last run) and the new files waiting, offers Change folder as a choice of its own in the accent, shows a job's progress and says what it did in the notice at the bottom right for 5 s (× closes it), and folds under Logs, until opened, how the import works, the files that could not be imported, the duplicates and Recompute everything (the import runs by itself)"
ears_type: "event-driven"
rationale: "The runner asked: \"kwestie zwiazane z folderem, recompute  import daj w popupie ktory sie otworzy po klikieniu na ikone stideprism\", then \"usun zbedne przyuciski z runs .. teraz sa pod logiem\", then \"pod logiem nie chce popup ale normalna strone\", and of the folder's name in the side menu: \"informacja o folderzen ... dodaj wlasnie do tej strony tez\"; then (24 Nov 2026): \"menu data pod logiem jest bezsensu .. przesun je cale pod settings ... jako pierwzza zakladka\". Model's choices: the whole screen moved as a tab of Settings, Data first and opened by /settings; the logo leads to the runs; Import folder and Recompute go from the Runs screen altogether, its texts pointing to this tab; Recompute asks before it rebuilds; a job goes on in the Processing Worker when the tab is left; the warning of data built by an older algorithm shown here too."
trigger: "the runner opens Settings (its first tab, Data), or an old link to /data or /folder"
---
