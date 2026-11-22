'use client';

import type { BlockDefinition, BlockInstance } from '@/lib/blocks';
import type { CurvePoint, CurveSource } from '@/lib/curve';
import type { WorkerEvent, WorkerJob, WorkerRequest } from '@/workers';

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

/** Runs one job in a fresh Processing Worker; resolves when it is done. */
export async function runInWorker(job: Exclude<WorkerJob, 'instances' | 'curve' | 'similar' | 'figures'>, handle: FileSystemDirectoryHandle, onProgress?: Progress): Promise<DoneEvent> {
  const m = await start({ type: job, handle }, onProgress);
  if (m.type !== 'done') throw new Error(`unexpected ${m.type}`);
  return m;
}

/** The instances of blocks that are not kept (being built, or living in a link), computed now in the Processing Worker. */
export async function instancesInWorker(defs: BlockDefinition[], handle: FileSystemDirectoryHandle, onProgress?: Progress, signal?: AbortSignal): Promise<Record<string, BlockInstance[]>> {
  const m = await start({ type: 'instances', handle, defs }, onProgress, signal);
  if (m.type !== 'instances') throw new Error(`unexpected ${m.type}`);
  return m.instances;
}

/** The pace curves of the stretches given, computed in the Processing Worker (it reads each run named once). */
export async function curvesInWorker(sources: CurveSource[], handle: FileSystemDirectoryHandle, onProgress?: Progress, signal?: AbortSignal): Promise<Record<string, CurvePoint[]>> {
  const m = await start({ type: 'curve', handle, sources }, onProgress, signal);
  if (m.type !== 'curves') throw new Error(`unexpected ${m.type}`);
  return m.curves;
}

/** The stretches of other runs like a selected one, found in the Processing Worker (requirement "Similar stretches of a selection"). */
export async function similarInWorker(query: SimilarQuery, handle: FileSystemDirectoryHandle, onProgress?: Progress, signal?: AbortSignal): Promise<SimilarResult> {
  const m = await start({ type: 'similar', handle, query }, onProgress, signal);
  if (m.type !== 'similar') throw new Error(`unexpected ${m.type}`);
  return m.result;
}

/** The curves by distance of stretches of runs (efforts), keyed `${runId}:${from}`, from the Processing Worker. */
export async function figuresInWorker(stretches: SimilarQuery[], handle: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<Record<string, EffortFigures>> {
  const m = await start({ type: 'figures', handle, stretches }, undefined, signal);
  if (m.type !== 'figures') throw new Error(`unexpected ${m.type}`);
  return m.figures;
}
