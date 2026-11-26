/// <reference lib="webworker" />
import { forgetRunFiles, isOutdated, keepRunFiles, readManifest, type DataFolder } from '@/lib/fs';
import { openDataFolder } from '@/lib/copy';
import type { BlockDefinition, BlockInstance } from '@/lib/blocks';
import { curvesOf, type CurvePoint, type CurveSource } from '@/lib/curve';
import { figuresOf, instancesOf, similarOf, type EffortFigures, type SimilarQuery, type SimilarResult } from '@/lib/detection';
import { addedRuns, cached, dataStamp, importFolder, recomputeEverything, refreshBlocks, refreshContext, seedDemo } from '@/lib/pipeline';

/** Messages between the Web App and the Processing Worker. */
/** context: gear or tags changed; blocks: block definitions changed; instances: blocks not kept, computed now; curve: pace curves of stretches; similar: stretches like a selected one; figures: the curves of stretches by distance; demo: the next part of the demo folder made. */
export type WorkerJob = 'import' | 'recompute' | 'context' | 'blocks' | 'instances' | 'curve' | 'similar' | 'figures' | 'demo';
/** id: the request's number, its events carry it (the worker that stays answers several requests). */
/** copy: the id of the folder's copy in the browser, when the page keeps one (ADR "A copy in the browser on phones"). */
export type WorkerRequest = { id?: number; copy?: string | null } & (
  /** ifOutdated: a recompute only while the folder is still an older version's (the app's own rebuild), else an import */
  | { type: Exclude<WorkerJob, 'instances' | 'curve' | 'similar' | 'figures' | 'demo'>; handle: FileSystemDirectoryHandle; ifOutdated?: boolean }
  /** part: the last half year, or the next runs of the history before it; lang: the language of the demo's own texts */
  | { type: 'demo'; handle: FileSystemDirectoryHandle; part: 'recent' | 'more'; lang: 'en' | 'pl' }
  | { type: 'figures'; handle: FileSystemDirectoryHandle; stretches: SimilarQuery[] }
  | { type: 'similar'; handle: FileSystemDirectoryHandle; query: SimilarQuery }
  | { type: 'instances'; handle: FileSystemDirectoryHandle; defs: BlockDefinition[] }
  | { type: 'curve'; handle: FileSystemDirectoryHandle; sources: CurveSource[] }
);
/** A request given up: it stops at its next file read. */
export interface CancelRequest { type: 'cancel'; id: number }
export type WorkerEvent = { id?: number } & (
  | { type: 'progress'; done: number; total: number; file: string }
  /** runIds: the runs an import added; rebuilt: false when a recompute asked for found the folder current already */
  /** remaining: the runs of the demo still to make */
  | { type: 'done'; imported: number; duplicates: number; errors: number; runIds?: string[]; rebuilt?: boolean; remaining?: number }
  /** the worker's copy of the folder failed: it writes the folder alone from here (lib/copy) */
  | { type: 'copy-broken' }
  | { type: 'instances'; instances: Record<string, BlockInstance[]> }
  | { type: 'curves'; curves: Record<string, CurvePoint[]> }
  | { type: 'similar'; result: SimilarResult }
  | { type: 'figures'; figures: Record<string, EffortFigures> }
  | { type: 'error'; message: string }
);

const send = (e: WorkerEvent) => (self as unknown as { postMessage(m: unknown): void }).postMessage(e);

/**
 * The run files this worker read, kept while the data stamp stays (the worker that stays: lib/client): up
 * to this many values of samples and windows, about 100 MB at 8 bytes a value: some 150 runs of an hour
 * recorded each second, or 30 of five hours. By their size and not their number, which on a phone let
 * 150 long runs take the memory the tab had (the review of 26 Nov 2026).
 */
const KEEP_VALUES = 12_000_000;
let keptFor: string | null = null;
/** The folder the worker that stays reads, kept between its requests. */
let readingFolder: Promise<DataFolder> | null = null;
/** The requests given up (the screen moved on). */
const cancelled = new Set<number>();

self.onmessage = async (msg: MessageEvent<WorkerRequest | CancelRequest>) => {
  if (msg.data.type === 'cancel') {
    cancelled.add(msg.data.id);
    return;
  }
  const e = msg as MessageEvent<WorkerRequest>;
  const id = e.data.id;
  const post = (ev: WorkerEvent) => send({ ...ev, id });
  const reading = e.data.type === 'instances' || e.data.type === 'curve' || e.data.type === 'figures' || e.data.type === 'similar';
  // The worker that stays reads one folder through one BrowserFolder, which keeps the handles and
  // texts it learned (the page starts another worker for another folder); a writing job's worker has its own.
  const copyBroken = () => send({ type: 'copy-broken' });
  const folder = await (reading ? (readingFolder ??= openDataFolder(e.data.handle, e.data.copy ?? null, copyBroken)) : openDataFolder(e.data.handle, e.data.copy ?? null, copyBroken));
  const onProgress = (p: { done: number; total: number; file: string }) => {
    // Given up: the job stops at its next file, the worker goes on with the others.
    if (id !== undefined && cancelled.has(id)) throw new DOMException('abandoned', 'AbortError');
    post({ type: 'progress', ...p });
  };
  try {
    if (e.data.type === 'instances' || e.data.type === 'curve' || e.data.type === 'figures' || e.data.type === 'similar') {
      // The run files kept for the data as they are: another stamp (new runs, a recompute, another folder), none kept.
      const stamp = await dataStamp(folder);
      if (stamp !== keptFor) { forgetRunFiles(); keptFor = stamp; }
      keepRunFiles(KEEP_VALUES);
    }
    if (e.data.type === 'instances') {
      // Computed once for the data as it is, then read from derived/cache/.
      const defs = e.data.defs;
      post({ type: 'instances', instances: (await cached(folder, 'instances', JSON.stringify(defs), () => instancesOf(folder, defs, onProgress))).value });
      return;
    }
    if (e.data.type === 'curve') {
      const sources = e.data.sources;
      post({ type: 'curves', curves: (await cached(folder, 'curves', JSON.stringify(sources), () => curvesOf(folder, sources, onProgress))).value });
      return;
    }
    if (e.data.type === 'figures') {
      const stretches = e.data.stretches;
      post({ type: 'figures', figures: (await cached(folder, 'figures', JSON.stringify(stretches), () => figuresOf(folder, stretches, onProgress))).value });
      return;
    }
    if (e.data.type === 'similar') {
      const query = e.data.query;
      post({ type: 'similar', result: (await cached(folder, 'similar', JSON.stringify(query), () => similarOf(folder, query, onProgress))).value });
      return;
    }
    if (e.data.type === 'demo') {
      const made = await seedDemo(folder, { part: e.data.part, lang: e.data.lang, onProgress });
      post({ type: 'done', imported: made.imported, duplicates: 0, errors: 0, remaining: made.remaining });
      return;
    }
    if (e.data.type === 'context' || e.data.type === 'blocks') {
      await (e.data.type === 'context' ? refreshContext : refreshBlocks)(folder);
      post({ type: 'done', imported: 0, duplicates: 0, errors: 0 });
      return;
    }
    // The app's own rebuild is decided on the page, before its turn: two tabs opened after an update each
    // asked for one, and the second deleted and rebuilt what the first had just built. Looked at again here,
    // under the lock: a folder current by now is imported into, no more.
    const rebuild = e.data.type === 'recompute' && !(e.data.ifOutdated && !isOutdated(await readManifest(folder)));
    const report = await (rebuild ? recomputeEverything : importFolder)(folder, { onProgress });
    post({ type: 'done', imported: report.imported, duplicates: report.duplicates, errors: report.errors, runIds: e.data.type === 'import' ? addedRuns(report) : [], ...(e.data.type === 'recompute' ? { rebuilt: rebuild } : {}) });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    if (id !== undefined) cancelled.delete(id);
  }
};
