/// <reference lib="webworker" />
import { BrowserFolder } from '@/lib/fs';
import type { BlockDefinition, BlockInstance } from '@/lib/blocks';
import { curvesOf, type CurvePoint, type CurveSource } from '@/lib/curve';
import { instancesOf } from '@/lib/detection';
import { importFolder, recomputeEverything, refreshBlocks, refreshContext } from '@/lib/pipeline';

/** Messages between the Web App and the Processing Worker. */
/** context: gear or tags changed; blocks: block definitions changed; instances: blocks not kept, computed now; curve: pace curves of stretches. */
export type WorkerJob = 'import' | 'recompute' | 'context' | 'blocks' | 'instances' | 'curve';
export type WorkerRequest =
  | { type: Exclude<WorkerJob, 'instances' | 'curve'>; handle: FileSystemDirectoryHandle }
  | { type: 'instances'; handle: FileSystemDirectoryHandle; defs: BlockDefinition[] }
  | { type: 'curve'; handle: FileSystemDirectoryHandle; sources: CurveSource[] };
export type WorkerEvent =
  | { type: 'progress'; done: number; total: number; file: string }
  | { type: 'done'; imported: number; duplicates: number; errors: number }
  | { type: 'instances'; instances: Record<string, BlockInstance[]> }
  | { type: 'curves'; curves: Record<string, CurvePoint[]> }
  | { type: 'error'; message: string };

const post = (e: WorkerEvent) => (self as unknown as { postMessage(m: unknown): void }).postMessage(e);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const folder = new BrowserFolder(e.data.handle);
  const onProgress = (p: { done: number; total: number; file: string }) => post({ type: 'progress', ...p });
  try {
    if (e.data.type === 'instances') {
      post({ type: 'instances', instances: await instancesOf(folder, e.data.defs, onProgress) });
      return;
    }
    if (e.data.type === 'curve') {
      post({ type: 'curves', curves: await curvesOf(folder, e.data.sources, onProgress) });
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
