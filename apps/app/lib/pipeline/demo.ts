import { joinContext } from '@/lib/context';
import { DEMO_KEPT_DAYS, DEMO_VERSION, dayNumber, demoDictionary, demoPlan, demoTags, demoUserFiles, generateRun, type DemoFile, type DemoLang, type PlannedRun } from '@/lib/demo';
import { runBlocks } from '@/lib/detection';
import { PATHS, forgetRunFiles, isOutdated, listFitFiles, markRunsNew, readJson, readManifest, writeJson, writeManifest, type DataFolder } from '@/lib/fs';
import { importRuns, runFromMessages, type ParsedRun } from '@/lib/ingest';
import { bumpStamp } from './cache';
import { addedRuns } from './importFolder';

/**
 * The demo folder made (the runner's request of 26 Nov 2026: "chce na stronie umiesicc opcje demo ...
 * czyli mozliwosc otwara isostride z przykladowymi danymi aby pokazac mozliwosci rozwiazania"): the runs
 * of the demo runner (lib/demo) written into the folder as FIT files and imported as any folder is, with
 * what the runner would have entered. Made in the browser, in parts, so the app opens after seconds:
 * first the last four months (what today's figures rest on), then the rest of the two years, newest first.
 * A demo opened again gets the days since; one older than eight weeks, or of another version of the
 * demo or of the app's data, is made again from today.
 */

/** The weeks made before the app opens on the demo: the bests of the last 90 days and most of today's fitness (its time constant is six weeks) rest on them. */
export const DEMO_RECENT_WEEKS = 18;
/** The runs generated and held in memory at once, before they are written to the index. */
const BATCH = 30;
/** The runs of the earlier history made in one call: the screens' own jobs get their turn between two. */
const MORE = 120;

export interface DemoOptions {
  /** recent: the last months, whole; more: the next runs of the history before them */
  part: 'recent' | 'more';
  /** the language the demo's own texts are written in, when it is made new */
  lang: DemoLang;
  now?: Date;
  onProgress?: (p: { done: number; total: number; file: string }) => void;
}

export interface DemoReport {
  /** the runs this call added */
  imported: number;
  /** the runs of the story still to make */
  remaining: number;
  /** the runs of the story up to now */
  total: number;
}

const userPath = (name: string) => `${PATHS.user}/${name}`;

/**
 * The day the demo's first part starts on: DEMO_RECENT_WEEKS back, and on from there to the runner's last
 * test of the critical speed before it. A history that opened on weeks of easy runs gave a critical speed
 * of their pace until its first hard effort, and the chart of it began with a cliff.
 */
export function recentFrom(plan: PlannedRun[], today: number): number {
  const cut = today - DEMO_RECENT_WEEKS * 7;
  for (let i = plan.length - 1; i >= 0; i--) if (plan[i].kind === 'test' && plan[i].day <= cut) return plan[i].day;
  return cut + 1;
}

/** The marker of a demo folder that still holds: the same version, made not long ago, its data current. */
async function keptDemo(folder: DataFolder, today: number): Promise<DemoFile | null> {
  const marker = await readJson<DemoFile>(folder, PATHS.demo);
  if (!marker || marker.version !== DEMO_VERSION || today < marker.anchor || today - marker.anchor > DEMO_KEPT_DAYS) return null;
  return isOutdated(await readManifest(folder)) ? null : marker;
}

/** A new demo folder: everything in it removed, the runner's own files written. */
async function startDemo(folder: DataFolder, today: number, lang: DemoLang, now: Date): Promise<DemoFile> {
  await folder.remove(PATHS.root);
  await folder.remove(PATHS.fit);
  forgetRunFiles();
  const files = demoUserFiles(today, lang, now);
  // The marker last: a folder cut off while its files were written has none, and is made again whole.
  const { 'demo.json': marker, ...rest } = files;
  for (const [name, value] of Object.entries(rest)) await writeJson(folder, userPath(name), value);
  await writeJson(folder, PATHS.runTags, { dictionary: demoDictionary(lang), tags: {} });
  await writeJson(folder, userPath('demo.json'), marker);
  return marker as DemoFile;
}

/** The tags of runs about to be imported, added to the folder's: a tag the visitor changed stays. */
async function addTags(folder: DataFolder, runs: PlannedRun[], marker: DemoFile): Promise<void> {
  const file = (await readJson<{ dictionary: unknown; tags: Record<string, unknown> }>(folder, PATHS.runTags)) ?? { dictionary: demoDictionary(marker.lang), tags: {} };
  await writeJson(folder, PATHS.runTags, { dictionary: file.dictionary, tags: { ...demoTags(runs, marker.anchor, marker.lang), ...file.tags } });
}

/** Makes the next part of the demo folder; see DemoOptions.part. Nothing to make: nothing is written. */
export async function seedDemo(folder: DataFolder, opts: DemoOptions): Promise<DemoReport> {
  const now = opts.now ?? new Date();
  const today = dayNumber(now);
  const marker = (await keptDemo(folder, today)) ?? (await startDemo(folder, today, opts.lang, now));
  const plan = demoPlan(marker.anchor, now, marker.lang);
  // A run is made once its file is imported: a file whose writing was cut off (the tab closed meanwhile) is left
  // empty, or whole and not imported; either is made again, not read as an error for as long as the demo is kept.
  const files = (await readManifest(folder))?.files ?? {};
  const have = new Set((await listFitFiles(folder)).filter((f) => files[f]?.status === 'imported' || files[f]?.status === 'duplicate'));
  // Newest first: a demo left half made holds its latest weeks whole.
  const missing = plan.filter((r) => !have.has(r.file)).reverse();
  const recent = missing.filter((r) => r.day >= recentFrom(plan, today));
  const todo = opts.part === 'recent' ? recent : missing.slice(0, Math.max(MORE, recent.length));
  const report: DemoReport = { imported: 0, remaining: missing.length - todo.length, total: plan.length };
  // A part cut off after its runs were imported and before its end (the context joined, the segments found: most of
  // its time) is ended now; the app opened on runs without their tags, load or form while the history was made.
  const unjoined = (await readManifest(folder))?.joined === false;
  if (!todo.length && !unjoined) {
    // A demo left before the segments of its last part were found: found now.
    if (marker.segmentsPending && !report.remaining) {
      await runBlocks(folder);
      await writeJson(folder, PATHS.demo, { ...marker, segmentsPending: false, complete: true } satisfies DemoFile);
    }
    return report;
  }

  if (todo.length) await addTags(folder, todo, marker);
  const added: string[] = [];
  for (let from = 0; from < todo.length; from += BATCH) {
    const batch = todo.slice(from, from + BATCH);
    // Each run generated, written as its FIT file, and kept as an import reads that file.
    const parsed = new Map<string, ParsedRun>();
    for (const [i, run] of batch.entries()) {
      opts.onProgress?.({ done: from + i, total: todo.length, file: run.file });
      const made = generateRun(run);
      await folder.writeBytes(run.file, made.fit);
      parsed.set(run.file, runFromMessages(made.messages));
    }
    added.push(...addedRuns(await importRuns(folder, { parsed: (file) => parsed.get(file) })));
  }
  opts.onProgress?.({ done: todo.length, total: todo.length, file: '' });
  // As an import ends (lib/pipeline/importFolder): the context joined, the segments found, the results kept dropped.
  // The segments of the earlier history are found once, when all of it is in: found after each part, the
  // routes shared by all the runs were matched against every run again each time, half the time of the whole.
  await joinContext(folder);
  const last = opts.part === 'recent' || !report.remaining;
  if (last) await runBlocks(folder);
  await bumpStamp(folder);
  const manifest = await readManifest(folder);
  if (manifest && manifest.joined === false) await writeManifest(folder, { ...manifest, joined: true });
  // A demo that was whole and is opened again: the days since are new runs, marked as an import marks them.
  if (marker.complete) await markRunsNew(folder, added);
  const next: DemoFile = { ...marker, segmentsPending: !last, complete: marker.complete || !report.remaining };
  if (next.segmentsPending !== !!marker.segmentsPending || next.complete !== !!marker.complete) await writeJson(folder, PATHS.demo, next);
  report.imported = added.length;
  return report;
}
