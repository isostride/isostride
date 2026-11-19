'use client';

import type { WorkerEvent, WorkerJob } from '@/workers';

export type DoneEvent = Extract<WorkerEvent, { type: 'done' }>;
export interface JobState {
  job: WorkerJob;
  done: number;
  total: number;
}

/**
 * Workers in flight, held here so that leaving the screen that started a job
 * neither ends it nor lets the browser collect it; screens can watch the job.
 */
const running = new Set<Worker>();
let current: JobState | null = null;
const listeners = new Set<(s: JobState | null) => void>();

function publish(s: JobState | null) {
  current = s;
  for (const l of listeners) l(s);
}

/** The job running now, if any, and its progress; returns an unsubscribe function. */
export function watchJob(listener: (s: JobState | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

/** Runs one job in a fresh Processing Worker; resolves when it is done. */
export function runInWorker(
  job: WorkerJob,
  handle: FileSystemDirectoryHandle,
  onProgress?: (p: { done: number; total: number; file: string }) => void,
): Promise<DoneEvent> {
  const w = new Worker(new URL('../../workers/pipeline.worker.ts', import.meta.url));
  running.add(w);
  const end = () => {
    w.terminate();
    running.delete(w);
    if (current?.job === job) publish(null);
  };
  publish({ job, done: 0, total: 0 });
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const m = e.data;
      if (m.type === 'progress') {
        publish({ job, done: m.done, total: m.total });
        onProgress?.(m);
      } else {
        end();
        if (m.type === 'done') resolve(m);
        else reject(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      end();
      reject(new Error(e.message));
    };
    w.postMessage({ type: job, handle });
  });
}
