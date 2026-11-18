/// <reference lib="webworker" />
import { runBlocks } from '@/lib/blocks/pipeline';
import { joinContext } from '@/lib/context/joinContext';
import { BrowserFolder } from '@/lib/fs/browserFolder';
import { importFolder } from '@/lib/ingest/importFolder';
import { recomputeEverything } from '@/lib/ingest/recompute';

/** Messages between the Web App and the Processing Worker. */
/** context: gear or tags changed; blocks: block definitions changed. */
export type WorkerJob = 'import' | 'recompute' | 'context' | 'blocks';
export type WorkerRequest = { type: WorkerJob; handle: FileSystemDirectoryHandle };
export type WorkerEvent =
  | { type: 'progress'; done: number; total: number; file: string }
  | { type: 'done'; imported: number; duplicates: number; errors: number }
  | { type: 'error'; message: string };

const post = (e: WorkerEvent) => (self as unknown as { postMessage(m: unknown): void }).postMessage(e);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const folder = new BrowserFolder(e.data.handle);
  const onProgress = (p: { done: number; total: number; file: string }) => post({ type: 'progress', ...p });
  try {
    if (e.data.type === 'context' || e.data.type === 'blocks') {
      if (e.data.type === 'context') await joinContext(folder);
      await runBlocks(folder);
      post({ type: 'done', imported: 0, duplicates: 0, errors: 0 });
      return;
    }
    const report = await (e.data.type === 'recompute' ? recomputeEverything : importFolder)(folder, { onProgress });
    post({ type: 'done', imported: report.imported, duplicates: report.duplicates, errors: report.errors });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
