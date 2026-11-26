import { afterEach, describe, expect, it } from 'vitest';
import { PATHS, forgetRunFiles, keepRunFiles, readRunFile, type DataFolder } from '@/lib/fs';
import { recordMeasure } from '../support/fixtures';

/**
 * The run files the reading worker keeps (ADR "One reading worker, files kept"): read once while the
 * data stay as they are, the oldest let go past the limit (counted in values, 40 a run here), all
 * forgotten when the data change.
 */
function folderOf(ids: string[]) {
  const reads: string[] = [];
  const folder: DataFolder = {
    name: 'f',
    list: async () => [],
    readBytes: async () => new Uint8Array(),
    readText: async (p) => {
      reads.push(p);
      const id = ids.find((i) => p === PATHS.runFile(i));
      return id ? JSON.stringify({ id, samples: { t: Array.from({ length: id === 'long' ? 100 : 10 }, (_, k) => k), values: {} }, windows: {}, metrics: [] }) : null;
    },
    writeText: async () => undefined,
    writeBytes: async () => undefined,
    remove: async () => undefined,
  };
  return { folder, reads };
}

afterEach(() => keepRunFiles(0));

describe('Run files kept by the reading worker', () => {
  it('Read once, the oldest let go, forgotten when the data change', async () => {
    const { folder, reads } = folderOf(['a', 'b', 'c']);
    keepRunFiles(80);
    await readRunFile(folder, 'a');
    await readRunFile(folder, 'b');
    await readRunFile(folder, 'a');
    await recordMeasure('keptRunFileReadsAgain', reads.length - 2);
    expect(reads).toEqual([PATHS.runFile('a'), PATHS.runFile('b')]);
    // A third run: the oldest used (b) is let go, a kept.
    await readRunFile(folder, 'c');
    await readRunFile(folder, 'a');
    expect(reads.length).toBe(3);
    await readRunFile(folder, 'b');
    expect(reads.length).toBe(4);
    // The data changed: read again.
    forgetRunFiles();
    await readRunFile(folder, 'a');
    expect(reads.length).toBe(5);
    // Off (the main thread, the writing workers): every read reads.
    keepRunFiles(0);
    await readRunFile(folder, 'a');
    await readRunFile(folder, 'a');
    expect(reads.length).toBe(7);
  });

  it('Kept by their size, not their number', async () => {
    // Room for two short runs (40 values each): a long one (400) takes it all, and is kept alone.
    const { folder, reads } = folderOf(['a', 'b', 'long']);
    keepRunFiles(80);
    await readRunFile(folder, 'a');
    await readRunFile(folder, 'b');
    await readRunFile(folder, 'long');
    await readRunFile(folder, 'long');
    expect(reads.length).toBe(3);
    await readRunFile(folder, 'b');
    expect(reads.length).toBe(4);
    // The short one read after it lets the long one go, and a second short one fits beside it.
    await readRunFile(folder, 'a');
    await readRunFile(folder, 'b');
    await readRunFile(folder, 'a');
    expect(reads.length).toBe(5);
    await readRunFile(folder, 'long');
    expect(reads.length).toBe(6);
  });

  it('Two jobs reading the same run at once count it once', async () => {
    // Three of Compare's jobs start on a cold cache and each read the two runs: counted three times over, the
    // size passed the limit with one run kept, and every later job read every file again.
    const { folder, reads } = folderOf(['a', 'b']);
    keepRunFiles(80);
    await Promise.all([0, 1, 2].flatMap(() => [readRunFile(folder, 'a'), readRunFile(folder, 'b')]));
    const cold = reads.length;
    await readRunFile(folder, 'a');
    await readRunFile(folder, 'b');
    expect(reads.length).toBe(cold);
  });
});
