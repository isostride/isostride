---
id: "a4b5c657-99ae-490c-89ba-79da8f76da5e"
type: "requirement"
label: "Data folder screen under the logo"
action: "open the Data folder screen, which names the folder, says what it holds (its runs, the FIT files read, the duplicates, the files that could not be read, the first and last run) and the new files waiting, offers Import folder, Recompute everything and Change folder, shows a job's progress and what it did, and lists the files that could not be imported"
ears_type: "event-driven"
rationale: "The runner asked: \"kwestie zwiazane z folderem, recompute  import daj w popupie ktory sie otworzy po klikieniu na ikone stideprism\", then \"usun zbedne przyuciski z runs .. teraz sa pod logiem\", then \"pod logiem nie chce popup ale normalna strone\", and of the folder's name in the side menu: \"informacja o folderzen ... dodaj wlasnie do tej strony tez\". Model's choices: a screen of its own at /folder, the logo and the folder's name both leading to it and the logo marked while it is shown; Import folder and Recompute go from the Runs screen altogether, its texts pointing to this screen; Recompute asks before it rebuilds; ⌘K → Import folder (and an old link with ?action=import) opens the screen and imports; a job goes on in the Processing Worker when the screen is left; the warning of data built by an older algorithm shown here too; the narrowing of the side menu, the logo's press before, is a switch in Settings, Display."
trigger: "the runner presses the Strideprism logo, or the folder's name under it"
---
