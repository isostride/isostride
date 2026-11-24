import { afterEach, describe, expect, it } from 'vitest';
import { PATHS, forgetRunFiles, keepRunFiles, readRunFile, type DataFolder } from '@/lib/fs';
import { recordMeasure } from '../support/fixtures';

/**
 * The run files the reading worker keeps (ADR "One reading worker, files kept"): read once while the
 * data stay as they are, the oldest let go past the limit, all forgotten when the data change.
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
      return id ? JSON.stringify({ id, samples: { values: {} }, windows: {}, metrics: [] }) : null;
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
    keepRunFiles(2);
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
});
