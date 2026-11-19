---
id: "8d04762f-4c1c-468b-8e99-b6fb65dfa133"
type: "need"
label: "Strideprism MVP – specification"
kind: "brief"
source: "Radical Forge"
---

Strideprism MVP – specification
18 Nov 2026 · @Tomasz
1. Goal and scope
The MVP must prove one thing: comparing blocks within the same context detects changes in running that watch averages do not show.
The MVP user is a single runner working on their own COROS FIT files, locally on their own computer.
The MVP supports three scenarios:
1.  Trend on a fixed route. How heart rate and form change on the same stretch of the long run, at a similar pace.
2.  Trend of a repeated workout. How the 25-minute tempo run changes: pace, heart rate, form and drift within the effort.
3.  Effect of a change. What new shoes changed, under the same conditions before and after.
2. Concepts
The block is the smallest unit of comparison. A block is a fragment of a run together with its context, not just a stretch of route.
Concept
Meaning
Block definition
A recipe that says which fragments of a run qualify, e.g. “25-minute tempo” or “promenade northbound, pace 4:45–5:15, at least 8 minutes into the run”
Block instance
A specific fragment of a specific run that meets the definition, with its context stored
Context
Everything that decides whether two instances may be compared. It has four layers (below)
Metric provenance
Which device and which algorithm produced a number. Wrist heart rate and arm-band heart rate are two different series
Noise threshold
The normal spread of a metric between instances under the same conditions. A difference below the threshold is not a result
The four context layers of an instance:
• The block itself: pace, grade, duration, direction on the route, the profile of metrics inside the block.
• What came before: minute and kilometre of the run, effort in the 2 minutes before the block, position in the workout structure.
• The run: shoes, heart rate sensor, workout type, technique cue.
• The day: load from previous days, temperature.
A trend is a series of instances of one definition over time. An A/B comparison is two sets of instances of one definition that differ in one context field.
3. Data model
Raw data is immutable, and everything derived can be rebuilt from it from scratch. Block definitions and rules will change, so no result may be the only copy.
Entity
Kind
Key fields
Run
raw
start time (key), source file, device, distance, duration
Sample
raw
run, timestamp (1 s), speed, heart rate, cadence, ground contact time, vertical oscillation, step length, power, altitude, GPS position, temperature, effort pace, leg spring stiffness
Lap
raw
run, start, end, duration, distance
Gear
user-entered
name, type (shoes, heart rate sensor), date range of use
RunTag
user-entered
run, workout type, technique cue, shoes (override), note
Window
derived
run, 10 s window, metric means, quality flags
RouteSegment
derived
reference track every 10 m, length, number of runs
BlockDefinition
user-entered or recommended
name, type, parameters, tolerances, origin (manual, recommendation)
BlockInstance
derived
definition, run, start, end, four context layers, metric means, per-minute profile, status (accepted, rejected with reason)
DayState
derived
date, load from the previous 3 and 7 days, days since the last hard session
Principles:
• Resolution levels: sample → step → window → block → run. The step level is empty in the MVP and waits for the sensors of step 2.
• Provenance: every metric in Sample records its source device. A device change starts a new series.
• Versioning: every derived table records the version of the algorithm that produced it.
• Place is optional: a run without GPS still produces blocks based on workout structure.
4. Functional requirements
The MVP has 15 requirements in four groups.
Import
• F1. Import FIT files from the chosen folder. Re-importing the same run does not create a duplicate (key: start time).
• F2. Read all fields from section 3, including COROS developer fields (effort pace, leg spring stiffness) and laps.
• F3. Quality flags on 10 s windows: stopped, first 150 s of the run, grade, missing sensor signal.
Context
• F4. Gear register with date ranges. Shoes and sensor are assigned to runs automatically by date, with an override for a single run.
• F5. Run tags: workout type, technique cue, note.
• F6. Day state computed from the user's own data: load from the previous 3 and 7 days and days since the last hard session.
Blocks
• F7. Three types of block definition: route segment (GPS), workout structure element (a lap of a given duration or distance), steady fragment within a given pace range.
• F8. Manual creation of a definition from a fragment selected on the run's chart or map.
• F9. Recommendations: the system proposes a definition when it finds at least 5 instances of a route segment or at least 3 workouts with the same structure.
• F10. Automatic detection of instances in historical runs and in every newly imported run.
Comparisons
• F11. Trend: a series of instances of one definition over time, for a chosen metric, filtered by context fields.
• F12. A/B comparison: two sets of instances that differ in one context field. The result is the difference, an uncertainty interval and a verdict against the noise threshold.
• F13. Profile inside the block: overlaid per-minute profiles of selected instances.
• F14. Transparency: every result shows the list of instances that went into it, plus the rejected ones with the reason for rejection.
• F15. Export of instances and results to CSV.
5. Comparison rules
A comparison works in two steps: first strict matching of conditions, then a model correction only for the residual pace difference. The result is always shown in both versions: raw and corrected.
The default matching tolerances come from the preliminary analysis of 18 Nov 2026, and the user can change them in the block definition.
Condition
Default value
Pace
the same band, 30 s/km wide
Grade
effort pace differs from pace by at most 4%
Route segment
at least 90% of points within 30 m of the reference track, same direction
Pace steadiness within the block
coefficient of variation of speed below 0.15
Effort before the block
mean speed over the 2 minutes before the block within 12% of the block's speed
Block start (for heart rate)
at least 8 minutes after the start of the run
Other rules:
• Minimum length depends on the metric. Ground contact time, cadence, vertical oscillation and step length: at least 60 s. Heart rate: at least 4 minutes. A shorter block yields a result only for the metrics that meet their threshold.
• Minimum number of instances. Trend: at least 5. A/B comparison: at least 4 on each side. Below these numbers the system shows the points without a verdict.
• Noise threshold. Computed for each metric and definition as the standard deviation between instances in the same context. In the preliminary analysis, ground contact time at a fixed pace varied between runs by about 2–3 ms; the value is to be confirmed on the full data.
• A/B verdict. “Change” when the uncertainty interval of the difference excludes zero and the difference exceeds the noise threshold. Otherwise “no detectable change”.
• Device change. Instances from different sensors form separate series and are not joined by a trend line.
• Warning about confounding with the fitness trend. When groups A and B do not interleave in time (e.g. shoes changed once and for good), the result carries a warning and a suggestion to rotate.
• Nesting. Blocks may overlap, but one fragment of a run enters a given comparison only once.
6. Interface
The MVP is a browser application with six screens. On first launch the user picks the data folder; later launches open the same folder.
Screen
What it shows
What you can do
Runs
List of runs, import status, assigned shoes and tags
Import the folder, correct a run's context
Run
Metrics over time, map, detected block instances
Select a fragment and create a block definition from it
Blocks
Definitions with instance counts, system recommendations
Accept or reject a recommendation, change tolerances
Trend
Instances of one definition over time, noise threshold, gear changes as vertical lines
Choose the metric and context filter, open the list of instances
A/B comparison
Difference with uncertainty interval, verdict, warnings, overlaid per-minute profiles
Choose the context field that splits the groups
Gear and tags
Register of shoes and sensors with dates, tag dictionary
Add gear, change a date range
Hovering over any point on a chart shows the full context of the instance: run, date, pace, direction, minute of the run, shoes and sensor.
7. Architecture and technology
The MVP is a React/TypeScript/Next.js application that runs entirely in the browser. The user points it at a folder on disk; the application reads FIT files from it and writes all its data there. There is no server and no database, and the data never leaves the computer.
Limitation: folder access (File System Access API, showDirectoryPicker) works in Chrome, Edge and Opera. Firefox and Safari do not support it (caniuse, as of 18 Nov 2026).
Layer
Choice
Rationale
Application
Next.js with static export, React, TypeScript
No server; the same model as Radical Studio; can be published as a plain web page
Data access
File System Access API, folder handle remembered in IndexedDB
The folder is picked once; on reopening it is enough to confirm access
FIT parser
Official Garmin FIT JavaScript SDK
The official SDK of the FIT format; reading COROS files with developer fields is to be confirmed at the start of stage 1
Processing
TypeScript in a Web Worker
Import and recomputation do not block the interface
Statistics
Own TypeScript module: linear regression, bootstrap for uncertainty intervals
The methods needed are simple and require no external libraries
Charts and map
To be chosen in stage 5
Requirement: selecting a range on a chart and a stretch on the map
Storage
Files in the user's folder (layout below)
The data is portable, readable and can be versioned or synced with any tool
Data flow:
1.  Import: new FIT files in the folder → Run, Sample, Lap.
2.  Preparation: Sample → Window with quality flags; GPS tracks → RouteSegment.
3.  Context: Gear, RunTag and DayState joined to runs by date.
4.  Detection: BlockDefinition + run data → BlockInstance with four context layers.
5.  Write: the results of steps 1–4 go to the folder as denormalized files.
6.  Analysis and presentation: trend, A/B comparison and noise threshold computed in the browser from the instance files; the screens of section 6 and CSV export.
The “Recompute everything” action rebuilds steps 1–5 from scratch from the FIT files.
Data folder layout:
my-folder/
  fit/                     # the user's FIT files, never modified by the app
  strideprism/
    manifest.json          # schema and algorithm versions, list of imported files
    user/                  # user-entered data, never recomputed
      gear.json
      run-tags.json
      block-definitions.json
    derived/               # derived data, fully rebuildable
      runs/<id>.json       # one run: samples and 10 s windows, columnar
      runs-index.json      # one row per run, with context
      segments.json
      block-instances.json # one row per instance, with full context
      day-state.json
Storage rules:
• Denormalization. runs-index.json and block-instances.json hold every field needed for trends and A/B comparisons (shoes, sensor, tags, day state), so the analysis screens do not open individual run files.
• Two directories, two rules. user/ is the only source of manually entered data and the application never overwrites it on recomputation. derived/ can be deleted entirely.
• Version mismatch. When the algorithm version in manifest.json is older than the application's, the application offers to recompute.
• Format. Columnar JSON (one array per field), about 100–300 KB per run. Moving to Parquet is an open decision (section 11).
All code is in TypeScript. Tests run on a few sample FIT files with hand-checked expected values.
Repository structure:
strideprism/
  app/              # Next.js pages (the screens of section 6)
  components/       # charts, map, tables
  lib/
    fs/             # folder access, reading and writing files, manifest
    ingest/         # FIT parser, import, deduplication
    prepare/        # 10 s windows, quality flags, route segments
    context/        # gear, tags, day state
    blocks/         # definitions, instance detection, recommendations
    compare/        # matching, pace correction, noise, A/B, trend
    stats/          # regression, bootstrap
  workers/          # Web Worker for import and recomputation
  tests/            # tests and sample FIT files with expected values
8. Out of scope for the MVP
The MVP deliberately leaves out everything that is not needed to test the method on one runner.
• Own IMU sensors and video analysis (step 2 of Strideprism).
• Per-step data and left/right leg split.
• Accounts, multiple users, cloud hosting, a mobile app.
• Automatic sync with COROS, Garmin or Strava; the MVP imports from a folder.
• Weather from an external source, sleep and HRV. The watch temperature serves only as an approximation.
• Training plans and advice. The tool shows what changed, not what to do.
• Sports other than running.
9. Acceptance criteria
The MVP is done when it meets all seven conditions on the author's data (runs since 3 Aug 2026).
1.  Import. All historical runs import without errors, and a repeated import adds no records.
2.  Recommendations. The system proposes the seaside promenade segment (about 1.1 km) and the 25-minute tempo on its own, without hints from the user.
3.  Agreement with the preliminary analysis. The heart rate trend on the promenade segment in the 4:45–5:15/km band reproduces the result of 18 Nov 2026: 34 steady passes, heart rate 149–154 in August and September and about 135 on 14 Nov.
4.  Shoe scenario. The A/B comparison for two pairs of shoes returns a difference, an uncertainty interval and a verdict, and shows a warning when the groups do not interleave.
5.  Negative test. An A/B comparison on a random split of runs returns “no detectable change” in at least 9 of 10 trials.
6.  Transparency. For every result the list of accepted and rejected instances can be opened, with the reason for rejection.
7.  Reproducibility. The “Recompute everything” action rebuilds the derived data directory from scratch from the FIT files and gives the same results, while user-entered data stays untouched.
Success criterion for the whole of step 1, beyond the software itself: within 4–6 weeks of use the tool detects at least one change in the author's running that is larger than the noise.
10. Delivery stages
Five stages, about 8–11 weeks of spare-time work in total. The estimates are rough.
Stage
Scope
Requirements
Time
1. Data foundation
App skeleton, folder access, FIT import in a Web Worker, file writing, 10 s windows, quality flags, gear and tag register
F1–F6
2–3 wks
2. Blocks
Three definition types, instance detection, instance context, recommendations
F7, F9, F10
2 wks
3. Trend
Strict matching, pace correction, noise threshold, profile inside the block
F11, F13, F14
1–2 wks
4. A/B comparison
Verdict, uncertainty intervals, warnings, negative test
F12
2 wks
5. Interface and release
Six screens, manual block creation, export, repository with instructions
F8, F15
1–2 wks
The results of stages 1–4 are checked by tests on sample FIT files before the full screens exist. Collecting data for the shoe scenario (rotating two pairs) is worth starting in stage 1, because it takes several weeks of runs.
11. Open decisions
Six things need the author's decision before the relevant stage starts.
[ ] List of shoes with dates of first use (needed for scenario 3; before stage 1).
[ ] Exact date of the switch from wrist heart rate to the arm band (the preliminary analysis assumed about 15 Oct 2026; before stage 1).
[ ] Source of files: manual export from COROS into the folder, or a download script (before stage 1).
[ ] Format of derived files: columnar JSON or Parquet (before stage 1; JSON is enough for a few hundred runs).
[ ] Open-source licence: permissive (MIT, Apache 2.0) or copyleft (AGPL) (before release).
[ ] Language of the interface and documentation: Polish, English or both (before stage 5).

Q: Specyfikacja mówi, że dostęp do folderu działa tylko w Chrome, Edge i Operze. Jakie wsparcie przeglądarek zapisać i co ma się stać w Firefoxie lub Safari?
A: Chromium + komunikat: wspierane tylko Chrome, Edge i Opera; w innych przeglądarkach aplikacja pokazuje komunikat o braku wsparcia i nie startuje.
Q: Otwarta decyzja z sekcji 11: skąd pochodzą pliki FIT? Od tego zależy, czy wymagania obejmą skrypt pobierania.
A: Ręczny eksport: użytkownik sam eksportuje pliki z COROS do folderu fit/.
Q: Format plików pochodnych (otwarta decyzja z sekcji 11): co zapisać w modelu?
A: Kolumnowy JSON.
Q: Ile może trwać import i przeliczenie? Specyfikacja nie podaje limitu czasu, a od tego zależą progi fitness functions dla wydajności.
A: ≤5 s/bieg, ≤15 min całość
Q: Ile czasu mogą zajmować ekrany analizy, czyli przeliczenie trendu lub porównania A/B z bootstrapem po zmianie filtra?
A: ≤3 s
Q: Co się dzieje z odrzuconą rekomendacją definicji bloku przy następnym wykrywaniu, np. po imporcie nowych biegów?
A: Zapamiętana (Recommended)
Q: Czy użytkownik może usunąć zaakceptowaną lub ręcznie utworzoną definicję bloku?
A: Nie w MVP (Recommended) (no requirement)
Q: tak etap 7 - dodaktowo jesli chdozi o mockupy .. chce nowoczesne UI. Jaki kierunek wizualny ma mieć nowoczesny interfejs Strideprism?
A: jasny lub ciemny, do wyboru i automatycznego wyboru bazujac na motywie kompuetara,
Q: Jak ma wyglądać nawigacja między sześcioma ekranami (Runs, Run, Blocks, Trend, A/B, Gear and tags)?
A: Boczny pasek + Cmd+K (Recommended) (no requirement)
Q: Jak pokazywać szczegóły instancji i listę przyjętych i odrzuconych instancji (przejrzystość wyniku)?
A: Wysuwany panel boczny (Recommended) (no requirement)
Q: Day State liczy „dni od ostatniego mocnego treningu”, ale specyfikacja nie definiuje mocnego treningu („hard session”). Jak go rozpoznać?
A: a po co ci dni od ostatniego mocnego treningu ? to bezsensu
Q: „Dni od ostatniego mocnego treningu” pochodzą z Twojej specyfikacji (F6 i encja DayState). Co z nim zrobić?
A: Usuń z modelu (Recommended)
Q: Co ma się stać, gdy plik FIT nie da się zaimportować (uszkodzony, nie-bieg)? Ekran Runs pokazuje status importu, ale żadne wymaganie tego nie opisuje.
A: Pomiń i pokaż błąd (Recommended): plik zostaje pominięty, import reszty trwa dalej, a na ekranie Runs widnieje plik z błędem i powodem; przy następnym imporcie jest próbowany ponownie.
Q: (użytkownik) momment ... a po co liczysz obciazenie ? to nie jest narzedzie do treningogu tylko analizy metruk. Odpowiedź: obciążenie to pole kontekstu instancji (filtr w trendzie, pole podziału A/B, kontrola zmęczenia), nie porada treningowa. Jak to rozstrzygnąć? 1. Zostawić obciążenie z 3 i 7 dni, usunąć tylko „dni od mocnego treningu”. 2. Usunąć Day State całkowicie. 3. Inaczej.
A: 1
Q: Acceptance criterion 3 (promenade HR trend) doesn't match the preliminary analysis of 18 Nov: the app finds the 1.0 km NE promenade segment with 32 passes since 3 Aug, but only 6 meet every condition for HR (4:45–5:15 pace band, steadiness, start ≥8 min), all in Oct–Nov, versus 34 in the analysis. There's also no 14 Nov run in test_data (the files end on 11 Nov). What should I do?
A: Investigate the gap (Recommended): I'll check which conditions knock out the Aug–Sep passes and try a longer segment / both directions. I'll also pull the 14 Nov run from your COROS account (MCP) into test_data.
Q: Which pack groups should I implement next? (each adds tests + metrics; some need changes to the code or the model)
A: Test strategy, Frontend: a11y, CWV, JS, Module boundaries, CI/GitHub items
Q: Acceptance criterion 3: the preliminary analysis of 18 Nov counted pace as distance/total time, including auto-pause at the lights (55–110 s per pass in Aug–Sep). With pace measured while moving and stops >10 s rejected, the app finds 5 steady passes in the 4:45–5:15 band (not 34), and HR on 14 Nov = 135 (matches). The Aug–Sep passes were run at 4:02–4:44 with HR 149–158. What should I do with criterion 3 in the model?
A: Update the criterion (Recommended): Keep HR ≈135 on 14 Nov (holds); replace '34 passes, 149–154 in Aug–Sep' with what the app computes without stops, with a note that the preliminary analysis counted waits at the lights into pace.
Q: (użytkownik) tak zaktuializaowalem check.json do bardziej restrykcyjnego modelu ... chce miec pelna feedback loop
Q: The 'A test pyramid' pack wants unit tests ≥70% of all tests, E2E ≤10%, each unit test <100 ms. Today: ~36 unit (synthetic data), ~42 integration (your real FIT files: matching, recommendations, acceptance), 12 E2E. The integration tests on real data are the core of verification here. What do you prefer?
A: Adjust the thresholds (Recommended): Change the FF in the model for this project: unit ≥40%, E2E ≤15%, unit <100 ms, integration on real data counted separately. Plus split tests into tests/unit and tests/integration, and add unit tests where they have value (stats, geo, structure, CSV, select).
Q: Items the packs tie to GitHub/SonarQube/Lighthouse CI (PR merge gate, nightly flaky quarantine, new-code coverage in SonarQube, Lighthouse): how should I do them while the project is local-only?
A: Local only
Q: (użytkownik) chodzi mi o to ze to ff powinno byc weryfikowawalne ... nawet teraz ... bo inaczej radical check nie przechodzi
A: FF "Detects real change" becomes automated: on the author's runs, with every suggested block accepted, the trends of all metrics are computed and at least one must have the verdict "change" (larger than the noise, its interval clear of zero, at least 5 instances); the random-split negative test keeps guarding against false alarms.
Q: (użytkownik) widze ... problem ... prism sugeruje bloki a pozniej jak przechodze do trend to czasami wszystkie biegi sa rejected
Q: On city routes you stop at the lights: on the 1.2 km SW segment 67 of 78 passes have 12–152 s of standing, so the current 'stopped ≤ 10 s' rule rejects them. How should a block with a stop be handled?
A: Measure on the moving part (Recommended): A stop does not reject the pass: pace and gait (cadence, GCT, VO…) are computed only from moving samples. HR is rejected only when the stop is long (>30 s) or happens in the last minutes of the block, because HR drops while standing. The rejection list shows how long the stop was.
Q: (użytkownik) ok po zakonczeniu 2 rzeczy 1. bloki powinny byc znajdywane po trasie ale tez powinny byc bloki logiczne ... np. 2 rozne trasy ale czasowka ... np. coros testy sa dobrymi kandydatamia 2. chce miec podglad z map
Q: Logical blocks (independent of route): COROS FIT exports carry no workout name or plan steps, so a test or time trial has to be recognised from the run itself. Which kinds should I add? (Lap-based 'structure' blocks, e.g. '25-minute lap', already work on any route.)
A: COROS test by its structure, By workout type tag, Effort (time trial)
Q: Map preview: today the map draws only the route line, with no background, because the app sends nothing over the network (requirement 'Data stays local', ADR 'Charts and map library'). Map tiles from a server reveal where you run. How do you want it?
A: Online tiles (OpenStreetMap): Background from the OSM tile server, switched on by you in settings. Simple and detailed, but every view sends the area of your route to the server: the 'no network' requirement and its fitness function change.
Q: (użytkownik) mam blok 30 min effort i tam nie mam tetna ... dlaczego ?
Q: Your 30-minute efforts start at minute 3–7 of the run, so the spec's rule 'heart rate only for a block starting at least 8 minutes into the run' drops HR for the whole block. How should heart rate be handled for a block that starts before minute 8?
A: nie ma problemu pod warunkiem ze wszystkie runy w bloku beda mialy tak samo ...... zaznacz to jako atrybut bloku
Q: (użytkownik) chce tez miec blokki ktore zaczynaja sie od startu zatrzymanego .....
Q: "Bloki, które zaczynają się od startu zatrzymanego": which do you mean?
A: Effort from a standing start: Like a time trial or test: the block starts from a stop (standing still or auto-pause just before it), not on the move. A block attribute 'start: standing / flying'; with 'standing', an instance must begin right after a stop, and every instance of the block starts the same way.
Q: The heart-rate attribute I was adding (HR from minute X of the block, the same for all its instances; 5 min by default for effort and workout-type blocks): should I carry on with it as well?
A: Yes, carry on
Q: (użytkownik) ok ... inny problem .... hr zostalo wykluiczone ale inne metryki sa ...w tym bloku ... jak to mozewe ? kryteria powinny wygladac bieg albo nie wykluczqac
Q: Today an instance can be accepted for pace/gait but left out for heart rate (block shorter than 4 min, starts before minute 8, a stop over 30 s or in the last 2 min). You want one decision per run: in the block or not. How?
A: Never exclude for HR: Acceptance depends only on the general conditions (pace, grade, steadiness, effort before, start); HR is always computed for accepted runs from the block's HR window, even after a stop or early in the run.
