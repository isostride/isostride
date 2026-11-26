import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JobState } from '@/lib/client/worker';

/**
 * The job the screens are shown (lib/client/worker, the review of 26 Nov 2026): each job running has its
 * own state, so one ending neither hides another still running nor leaves its name on another's progress.
 * The workers here are stand-ins that answer when the test says so.
 */
class StubWorker {
  static all: StubWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posted: { type: string; id?: number }[] = [];
  constructor() { StubWorker.all.push(this); }
  postMessage(m: { type: string; id?: number }) { this.posted.push(m); }
  terminate() {}
  answer(m: object) { this.onmessage?.({ data: m }); }
}

const handle = { name: 'folder' } as unknown as FileSystemDirectoryHandle;
const real = (globalThis as { Worker?: unknown }).Worker;
beforeAll(() => { (globalThis as { Worker?: unknown }).Worker = StubWorker; });
afterAll(() => { (globalThis as { Worker?: unknown }).Worker = real; });

describe('The job shown to the screens', () => {
  it('Each job its own: one ending hides no other', async () => {
    const { curvesInWorker, figuresInWorker, runInWorker, watchJob } = await import('@/lib/client/worker');
    const seen: (JobState | null)[] = [];
    const unwatch = watchJob((s) => seen.push(s));
    const shown = () => seen[seen.length - 1];
    // Two reads of the same kind at once (two charts of Compare): the first to end leaves the second shown.
    const first = figuresInWorker([], handle);
    const second = figuresInWorker([], handle);
    const reader = StubWorker.all[0];
    const [a, b] = reader.posted.map((m) => m.id!);
    reader.answer({ id: a, type: 'figures', figures: {} });
    await first;
    expect(shown()).toMatchObject({ job: 'figures' });
    // An import starts: it is the one shown, with its progress, and a read started and ended meanwhile does not hide it.
    const importing = runInWorker('import', handle);
    await new Promise((r) => setTimeout(r, 0));
    const writer = StubWorker.all[1];
    writer.answer({ type: 'progress', done: 3, total: 10, file: 'x.fit' });
    expect(shown()).toEqual({ job: 'import', done: 3, total: 10 });
    const curves = curvesInWorker([], handle);
    expect(shown()).toEqual({ job: 'import', done: 3, total: 10 });
    reader.answer({ id: reader.posted[2].id, type: 'curves', curves: {} });
    await curves;
    expect(shown()).toEqual({ job: 'import', done: 3, total: 10 });
    // The import ends: the read still running is shown; when it ends too, none.
    writer.answer({ type: 'done', imported: 1, duplicates: 0, errors: 0 });
    await importing;
    expect(shown()).toMatchObject({ job: 'figures' });
    reader.answer({ id: b, type: 'figures', figures: {} });
    await second;
    expect(shown()).toBeNull();
    unwatch();
  });
});
