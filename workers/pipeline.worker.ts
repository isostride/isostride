/// <reference lib="webworker" />
import { BrowserFolder } from '@/lib/fs';
import { seriesOfRuns, type MetricKey, type RunSet, type Series } from '@/lib/ask';
import { importFolder, recomputeEverything, refreshBlocks, refreshContext } from '@/lib/pipeline';

/** Messages between the Web App and the Processing Worker. */
/** context: gear or tags changed; blocks: block definitions changed; series: a run set's metrics for Analysis. */
export type WorkerJob = 'import' | 'recompute' | 'context' | 'blocks' | 'series';
export type WorkerRequest = { type: Exclude<WorkerJob, 'series'>; handle: FileSystemDirectoryHandle } | { type: 'series'; handle: FileSystemDirectoryHandle; set: RunSet; keys: MetricKey[] };
export type WorkerEvent =
  | { type: 'progress'; done: number; total: number; file: string }
  | { type: 'done'; imported: number; duplicates: number; errors: number }
  | { type: 'series'; series: Record<string, Series> }
  | { type: 'error'; message: string };

const post = (e: WorkerEvent) => (self as unknown as { postMessage(m: unknown): void }).postMessage(e);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const folder = new BrowserFolder(e.data.handle);
  const onProgress = (p: { done: number; total: number; file: string }) => post({ type: 'progress', ...p });
  try {
    if (e.data.type === 'series') {
      post({ type: 'series', series: await seriesOfRuns(folder, e.data.set, e.data.keys, onProgress) });
      return;
    }
    if (e.data.type === 'context' || e.data.type === 'blocks') {
      await (e.data.type === 'context' ? refreshContext : refreshBlocks)(folder);
      post({ type: 'done', imported: 0, duplicates: 0, errors: 0 });
      return;
    }
    const report = await (e.data.type === 'recompute' ? recomputeEverything : importFolder)(folder, { onProgress });
    post({ type: 'done', imported: report.imported, duplicates: report.duplicates, errors: report.errors });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
