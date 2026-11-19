/// <reference lib="webworker" />
import { BrowserFolder } from '@/lib/fs';
import { answerQuestion, type Answer, type Query } from '@/lib/ask';
import { importFolder, recomputeEverything, refreshBlocks, refreshContext } from '@/lib/pipeline';

/** Messages between the Web App and the Processing Worker. */
/** context: gear or tags changed; blocks: block definitions changed; ask: a question about the data. */
export type WorkerJob = 'import' | 'recompute' | 'context' | 'blocks' | 'ask';
export type WorkerRequest = { type: Exclude<WorkerJob, 'ask'>; handle: FileSystemDirectoryHandle } | { type: 'ask'; handle: FileSystemDirectoryHandle; query: Query };
export type WorkerEvent =
  | { type: 'progress'; done: number; total: number; file: string }
  | { type: 'done'; imported: number; duplicates: number; errors: number }
  | { type: 'answer'; answer: Answer }
  | { type: 'error'; message: string };

const post = (e: WorkerEvent) => (self as unknown as { postMessage(m: unknown): void }).postMessage(e);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const folder = new BrowserFolder(e.data.handle);
  const onProgress = (p: { done: number; total: number; file: string }) => post({ type: 'progress', ...p });
  try {
    if (e.data.type === 'ask') {
      post({ type: 'answer', answer: await answerQuestion(folder, e.data.query, onProgress) });
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
