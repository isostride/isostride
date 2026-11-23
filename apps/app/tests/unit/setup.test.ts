import { describe, expect, it } from 'vitest';
import { readSetup, setupWanted, writeSetup } from '@/lib/settings';
import type { DataFolder } from '@/lib/fs';

/** A folder in memory: its files by path. */
function memoryFolder(): DataFolder & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    name: 'mem', files,
    readText: async (p: string) => files.get(p) ?? null,
    writeText: async (p: string, t: string) => { files.set(p, t); },
  } as unknown as DataFolder & { files: Map<string, string> };
}

describe('Setup wizard', () => {
  it('Opens by itself once in a folder, set up before or not', async () => {
    expect(setupWanted(null)).toBe(true);
    expect(setupWanted({ state: 'skipped', at: '2026-11-23T10:00:00.000Z' })).toBe(false);
    expect(setupWanted({ state: 'done', at: '2026-11-23T10:00:00.000Z' })).toBe(false);
  });

  it('Kept in the folder: gone through or skipped', async () => {
    const folder = memoryFolder();
    expect(await readSetup(folder)).toBeNull();
    await writeSetup(folder, 'done', new Date('2026-11-23T10:00:00Z'));
    expect(await readSetup(folder)).toEqual({ state: 'done', at: '2026-11-23T10:00:00.000Z' });
    folder.files.set('.isostride/user/setup.json', '{"state":"other"}');
    expect(await readSetup(folder)).toBeNull();
  });
});
