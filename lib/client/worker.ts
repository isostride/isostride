'use client';

import type { WorkerEvent, WorkerJob } from '@/workers/pipeline.worker';

export type DoneEvent = Extract<WorkerEvent, { type: 'done' }>;

/** Runs one job in a fresh Processing Worker; resolves when it is done. */
export function runInWorker(
  job: WorkerJob,
  handle: FileSystemDirectoryHandle,
  onProgress?: (p: { done: number; total: number; file: string }) => void,
): Promise<DoneEvent> {
  const w = new Worker(new URL('../../workers/pipeline.worker.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m);
      else {
        w.terminate();
        if (m.type === 'done') resolve(m);
        else reject(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message));
    };
    w.postMessage({ type: job, handle });
  });
}
