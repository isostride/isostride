/// <reference lib="webworker" />
import { BrowserFolder, forgetRunFiles, keepRunFiles } from '@/lib/fs';
import type { BlockDefinition, BlockInstance } from '@/lib/blocks';
import { curvesOf, type CurvePoint, type CurveSource } from '@/lib/curve';
import { figuresOf, instancesOf, similarOf, type EffortFigures, type SimilarQuery, type SimilarResult } from '@/lib/detection';
import { addedRuns, cached, dataStamp, importFolder, recomputeEverything, refreshBlocks, refreshContext } from '@/lib/pipeline';

/** Messages between the Web App and the Processing Worker. */
/** context: gear or tags changed; blocks: block definitions changed; instances: blocks not kept, computed now; curve: pace curves of stretches; similar: stretches like a selected one; figures: the curves of stretches by distance. */
export type WorkerJob = 'import' | 'recompute' | 'context' | 'blocks' | 'instances' | 'curve' | 'similar' | 'figures';
/** id: the request's number, its events carry it (the worker that stays answers several requests). */
export type WorkerRequest = { id?: number } & (
  | { type: Exclude<WorkerJob, 'instances' | 'curve' | 'similar' | 'figures'>; handle: FileSystemDirectoryHandle }
  | { type: 'figures'; handle: FileSystemDirectoryHandle; stretches: SimilarQuery[] }
  | { type: 'similar'; handle: FileSystemDirectoryHandle; query: SimilarQuery }
  | { type: 'instances'; handle: FileSystemDirectoryHandle; defs: BlockDefinition[] }
  | { type: 'curve'; handle: FileSystemDirectoryHandle; sources: CurveSource[] }
);
/** A request given up: it stops at its next file read. */
export interface CancelRequest { type: 'cancel'; id: number }
export type WorkerEvent = { id?: number } & (
  | { type: 'progress'; done: number; total: number; file: string }
  /** runIds: the runs an import added */
  | { type: 'done'; imported: number; duplicates: number; errors: number; runIds?: string[] }
  | { type: 'instances'; instances: Record<string, BlockInstance[]> }
  | { type: 'curves'; curves: Record<string, CurvePoint[]> }
  | { type: 'similar'; result: SimilarResult }
  | { type: 'figures'; figures: Record<string, EffortFigures> }
  | { type: 'error'; message: string }
);

const send = (e: WorkerEvent) => (self as unknown as { postMessage(m: unknown): void }).postMessage(e);

/** The run files this worker read, kept while the data stamp stays (the worker that stays: lib/client). */
const KEEP_RUNS = 150;
let keptFor: string | null = null;
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
  const folder = new BrowserFolder(e.data.handle);
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
      keepRunFiles(KEEP_RUNS);
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
    if (e.data.type === 'context' || e.data.type === 'blocks') {
      await (e.data.type === 'context' ? refreshContext : refreshBlocks)(folder);
      post({ type: 'done', imported: 0, duplicates: 0, errors: 0 });
      return;
    }
    const report = await (e.data.type === 'recompute' ? recomputeEverything : importFolder)(folder, { onProgress });
    post({ type: 'done', imported: report.imported, duplicates: report.duplicates, errors: report.errors, runIds: e.data.type === 'import' ? addedRuns(report) : [] });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    if (id !== undefined) cancelled.delete(id);
  }
};
