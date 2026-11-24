---
id: "93361e28-caed-42b4-9f93-7d5759c549ac"
type: "adr"
label: "One reading worker, files kept"
alternatives: "A cache of parsed JSON objects for the screens: the objects would be shared, a screen changing one would change it for all. One worker for every job: an import would hold Compare's reading back."
consequences: "Compare's jobs read each run once; the screens' repeated reads cost a look at the file's time and size. The worker holds up to 150 runs in memory (about 150 MB at most). A file another worker rewrote within the same millisecond to the same size would be read stale: the writers change sizes as they add data, and each worker forgets what it writes."
context: "The review of 24 Nov 2026: each job that only reads (blocks not kept, curves, similar stretches, efforts' figures) ran in a fresh worker, so Compare's jobs one after another each read every run file again; the screens read the same files again and again (the Dashboard the runs' index about 9 times, settings about 7 times); a fetch from COROS and the import by itself could write the folder's data at once."
date: "2026-11-24"
decision: "We will run the reading jobs in one Processing Worker that stays, answering numbered requests (a request given up stops at its next file), keeping the last 150 run files it read while the data stamp stays; the jobs that write (import, recompute, context, blocks) keep a fresh worker each, one after another. A folder keeps the texts of the files it read with their time and size (up to 24 M characters, the run files left to the worker) and reads a file again only when it changed; reads of one file at once share one reading."
status: "accepted"
---
