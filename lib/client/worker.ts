'use client';

import type { Answer, Query } from '@/lib/ask';
import type { WorkerEvent, WorkerJob, WorkerRequest } from '@/workers';

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

type Progress = (p: { done: number; total: number; file: string }) => void;

/** Starts a request in a fresh Processing Worker; resolves with its final event. */
function start(request: WorkerRequest, onProgress?: Progress, signal?: AbortSignal): Promise<Exclude<WorkerEvent, { type: 'progress' | 'error' }>> {
  const job = request.type;
  const w = new Worker(new URL('../../workers/pipeline.worker.ts', import.meta.url));
  running.add(w);
  const end = () => {
    w.terminate();
    running.delete(w);
    if (current?.job === job) publish(null);
  };
  publish({ job, done: 0, total: 0 });
  // Abandoned (the controls changed again): the worker stops reading, and the promise never settles.
  signal?.addEventListener('abort', end, { once: true });
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const m = e.data;
      if (m.type === 'progress') {
        publish({ job, done: m.done, total: m.total });
        onProgress?.(m);
      } else {
        end();
        if (m.type === 'error') reject(new Error(m.message));
        else resolve(m);
      }
    };
    w.onerror = (e) => {
      end();
      reject(new Error(e.message));
    };
    w.postMessage(request);
  });
}

/** Runs one job in a fresh Processing Worker; resolves when it is done. */
export async function runInWorker(job: Exclude<WorkerJob, 'ask'>, handle: FileSystemDirectoryHandle, onProgress?: Progress): Promise<DoneEvent> {
  const m = await start({ type: job, handle }, onProgress);
  if (m.type !== 'done') throw new Error(`unexpected ${m.type}`);
  return m;
}

/** Answers a question about the data in the Processing Worker (it reads every run the question covers). */
export async function askInWorker(query: Query, handle: FileSystemDirectoryHandle, onProgress?: Progress, signal?: AbortSignal): Promise<Answer> {
  const m = await start({ type: 'ask', handle, query }, onProgress, signal);
  if (m.type !== 'answer') throw new Error(`unexpected ${m.type}`);
  return m.answer;
}
