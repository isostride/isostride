/// <reference lib="webworker" />
import { BrowserFolder } from '@/lib/fs';
import type { BlockDefinition, BlockInstance } from '@/lib/blocks';
import { curvesOf, type CurvePoint, type CurveSource } from '@/lib/curve';
import { instancesOf, similarOf, type SimilarQuery, type SimilarResult } from '@/lib/detection';
import { cached, importFolder, recomputeEverything, refreshBlocks, refreshContext } from '@/lib/pipeline';

/** Messages between the Web App and the Processing Worker. */
/** context: gear or tags changed; blocks: block definitions changed; instances: blocks not kept, computed now; curve: pace curves of stretches; similar: stretches like a selected one. */
export type WorkerJob = 'import' | 'recompute' | 'context' | 'blocks' | 'instances' | 'curve' | 'similar';
export type WorkerRequest =
  | { type: Exclude<WorkerJob, 'instances' | 'curve' | 'similar'>; handle: FileSystemDirectoryHandle }
  | { type: 'similar'; handle: FileSystemDirectoryHandle; query: SimilarQuery }
  | { type: 'instances'; handle: FileSystemDirectoryHandle; defs: BlockDefinition[] }
  | { type: 'curve'; handle: FileSystemDirectoryHandle; sources: CurveSource[] };
export type WorkerEvent =
  | { type: 'progress'; done: number; total: number; file: string }
  | { type: 'done'; imported: number; duplicates: number; errors: number }
  | { type: 'instances'; instances: Record<string, BlockInstance[]> }
  | { type: 'curves'; curves: Record<string, CurvePoint[]> }
  | { type: 'similar'; result: SimilarResult }
  | { type: 'error'; message: string };

const post = (e: WorkerEvent) => (self as unknown as { postMessage(m: unknown): void }).postMessage(e);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const folder = new BrowserFolder(e.data.handle);
  const onProgress = (p: { done: number; total: number; file: string }) => post({ type: 'progress', ...p });
  try {
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
    post({ type: 'done', imported: report.imported, duplicates: report.duplicates, errors: report.errors });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
