'use client';

import type { BlockDefinition, BlockInstance } from '@/lib/blocks';
import type { CurvePoint, CurveSource } from '@/lib/curve';
import { t } from '@/lib/i18n';
import type { CancelRequest, WorkerEvent, WorkerJob, WorkerRequest } from '@/workers';

export type DoneEvent = Extract<WorkerEvent, { type: 'done' }>;
/** The stretch a search for similar ones starts from, and what it finds (lib/detection, through the worker's messages). */
export type SimilarQuery = Extract<WorkerRequest, { type: 'similar' }>['query'];
export type SimilarResult = Extract<WorkerEvent, { type: 'similar' }>['result'];
export type SimilarStretch = SimilarResult['route'][number];
/** An effort's figures and its 10 s windows, for the chart of the Efforts tab. */
export type EffortFigures = Extract<WorkerEvent, { type: 'figures' }>['figures'][string];
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
  return new Promise((resolve, reject) => {
    // Abandoned (the screen moved on): the worker stops reading and the promise rejects.
    signal?.addEventListener('abort', () => { end(); reject(new DOMException('abandoned', 'AbortError')); }, { once: true });
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

type ReadRequest = Extract<WorkerRequest, { type: 'instances' | 'curve' | 'similar' | 'figures' }>;
type Final = Exclude<WorkerEvent, { type: 'progress' | 'error' }>;

/**
 * The Processing Worker that stays, for the jobs that only read (blocks not kept, curves, similar
 * stretches, efforts' figures): it keeps the run files it read while the data stay as they are, so
 * Compare's jobs one after another read each run once (the review of 24 Nov 2026, "tak zrob 1-4").
 * A job given up stops at its next file; the worker goes on with the others.
 */
let reader: Worker | null = null;
let nextId = 1;
const asked = new Map<number, { job: WorkerJob; resolve: (m: Final) => void; reject: (e: Error) => void; onProgress?: Progress }>();

function readerWorker(): Worker {
  if (reader) return reader;
  const w = new Worker(new URL('../../workers/pipeline.worker.ts', import.meta.url));
  w.onmessage = (e: MessageEvent<WorkerEvent>) => {
    const m = e.data;
    const a = m.id === undefined ? undefined : asked.get(m.id);
    if (!a) return;
    if (m.type === 'progress') {
      publish({ job: a.job, done: m.done, total: m.total });
      a.onProgress?.(m);
      return;
    }
    asked.delete(m.id!);
    if (current?.job === a.job) publish(null);
    if (m.type === 'error') a.reject(new Error(m.message));
    else a.resolve(m);
  };
  // The worker failed as a whole: every request with it, and the next one starts another.
  w.onerror = (e) => {
    reader = null;
    w.terminate();
    for (const [id, a] of asked) { asked.delete(id); a.reject(new Error(e.message)); }
    publish(null);
  };
  return (reader = w);
}

/** Asks the worker that stays; a signal gives the request up. */
function ask(request: ReadRequest, onProgress?: Progress, signal?: AbortSignal): Promise<Final> {
  const id = nextId++;
  const w = readerWorker();
  publish({ job: request.type, done: 0, total: 0 });
  return new Promise((resolve, reject) => {
    asked.set(id, { job: request.type, resolve, reject, onProgress });
    signal?.addEventListener('abort', () => {
      if (!asked.delete(id)) return;
      w.postMessage({ type: 'cancel', id } satisfies CancelRequest);
      if (current?.job === request.type) publish(null);
      reject(new DOMException('abandoned', 'AbortError'));
    }, { once: true });
    w.postMessage({ ...request, id });
  });
}

/**
 * The jobs that write the folder's data (import, recompute, context, blocks), one after another: an
 * import started while another runs (the import by itself and a fetch from COROS, a tag saved during
 * an import) waits for it, so two workers never write the manifest and the index at once.
 */
let writing: Promise<unknown> = Promise.resolve();

/** Runs one job in a fresh Processing Worker, after the jobs writing the data before it; resolves when it is done. */
export async function runInWorker(job: Exclude<WorkerJob, 'instances' | 'curve' | 'similar' | 'figures'>, handle: FileSystemDirectoryHandle, onProgress?: Progress): Promise<DoneEvent> {
  const turn = writing.then(() => start({ type: job, handle }, onProgress));
  writing = turn.catch(() => undefined);
  const m = await turn;
  if (m.type !== 'done') throw new Error(t('unexpected {type}', { type: m.type }));
  return m;
}

/** The instances of blocks that are not kept (being built, or living in a link), computed now in the Processing Worker. */
export async function instancesInWorker(defs: BlockDefinition[], handle: FileSystemDirectoryHandle, onProgress?: Progress, signal?: AbortSignal): Promise<Record<string, BlockInstance[]>> {
  const m = await ask({ type: 'instances', handle, defs }, onProgress, signal);
  if (m.type !== 'instances') throw new Error(t('unexpected {type}', { type: m.type }));
  return m.instances;
}

/** The pace curves of the stretches given, computed in the Processing Worker (it reads each run named once). */
export async function curvesInWorker(sources: CurveSource[], handle: FileSystemDirectoryHandle, onProgress?: Progress, signal?: AbortSignal): Promise<Record<string, CurvePoint[]>> {
  const m = await ask({ type: 'curve', handle, sources }, onProgress, signal);
  if (m.type !== 'curves') throw new Error(t('unexpected {type}', { type: m.type }));
  return m.curves;
}

/** The stretches of other runs like a selected one, found in the Processing Worker (requirement "Similar stretches of a selection"). */
export async function similarInWorker(query: SimilarQuery, handle: FileSystemDirectoryHandle, onProgress?: Progress, signal?: AbortSignal): Promise<SimilarResult> {
  const m = await ask({ type: 'similar', handle, query }, onProgress, signal);
  if (m.type !== 'similar') throw new Error(t('unexpected {type}', { type: m.type }));
  return m.result;
}

/** The curves by distance of stretches of runs (efforts), keyed `${runId}:${from}`, from the Processing Worker. */
export async function figuresInWorker(stretches: SimilarQuery[], handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<Record<string, EffortFigures>> {
  const m = await ask({ type: 'figures', handle, stretches }, undefined, signal);
  if (m.type !== 'figures') throw new Error(t('unexpected {type}', { type: m.type }));
  return m.figures;
}
