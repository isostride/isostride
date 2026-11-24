import { describe, expect, it } from 'vitest';
import { diagnose, diagnosticText } from '@/lib/fs';
import { importFolder } from '@/lib/pipeline';
import { FILES, makeDataFolder } from '../support/fixtures';
import { NodeFolder } from '../support/nodeFolder';

/**
 * Diagnostics of this device (requirement "Diagnostics of this device"): the folder listed, its index,
 * settings, blocks and run files read and parsed, each step timed, as lines to copy.
 */
describe('Diagnostics of this device', () => {
  it('Each read of the folder timed, as lines to copy', async () => {
    const folder = await makeDataFolder([FILES.pace4, FILES.pace3]);
    await importFolder(folder);
    let clock = 0;
    const steps = await diagnose(() => new NodeFolder(folder.root), () => (clock += 5));
    const text = diagnosticText(steps);
    expect(steps.map((s) => s.what)).toEqual([
      'list the folder', 'list its FIT files', 'read runs-index.json (first time)', 'parse runs-index.json', 'read runs-index.json (again)',
      'read settings.json', 'read block-instances.json', 'read the last run file', 'parse the last run file', 'read 2 run files one after another', 'read a FIT file',
    ]);
    expect(steps.every((s) => s.ms === 5)).toBe(true);
    expect(text).toContain('list its FIT files: 5 ms (2 files)');
    expect(text).toContain('parse runs-index.json: 5 ms (2 runs)');
    expect(text).toContain('read 2 run files one after another: 5 ms (3 ms each)');
  });
});
