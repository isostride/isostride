import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PATHS, readJson, writeJson } from '@/lib/fs';
import { APP_VERSION, versionLabel } from '@/lib/kernel';
import { NodeFolder } from '../support/nodeFolder';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
/** The release script (scripts/release.mjs), plain JavaScript. */
type Release = {
  fullVersion: (v: string) => string | null;
  notesOf: (text: string, version: string) => string | null;
  changelogReleased: (text: string, version: string, date: string) => string;
  lockWithVersion: (lock: object, version: string) => object;
};
let changelogReleased: Release['changelogReleased'], fullVersion: Release['fullVersion'], lockWithVersion: Release['lockWithVersion'], notesOf: Release['notesOf'];
beforeAll(async () => ({ changelogReleased, fullVersion, lockWithVersion, notesOf } = (await import('../../scripts/release.mjs' as string)) as Release));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('App version shown', () => {
  it('Version shown and recorded', async () => {
    // One version, the root package.json's, in the app, the site and the lock file.
    const version = JSON.parse(read('package.json')).version;
    expect(APP_VERSION).toBe(version);
    for (const f of ['apps/app/package.json', 'apps/site/package.json']) expect(JSON.parse(read(f)).version).toBe(version);
    const lock = JSON.parse(read('package-lock.json'));
    for (const k of ['', 'apps/app', 'apps/site']) expect(lock.packages[k].version).toBe(version);
    // The changelog has the notes of the version.
    expect(notesOf(read('CHANGELOG.md'), version)).toBeTruthy();
    // Shown without a patch of 0.
    expect([versionLabel('0.1.0'), versionLabel('0.1.2'), versionLabel('1.0.0'), versionLabel('10.20.0')]).toEqual(['0.1', '0.1.2', '1.0', '10.20']);
    // Every object written to the data folder says which version wrote it; anything else as it is.
    const folder = new NodeFolder(path.join(dir, 'f'));
    await writeJson(folder, PATHS.settings, { schemaVersion: 1 });
    expect(await readJson(folder, PATHS.settings)).toEqual({ schemaVersion: 1, app: { version, commit: null } });
    await writeJson(folder, PATHS.gear, [1, 2]);
    expect(await readJson(folder, PATHS.gear)).toEqual([1, 2]);
  });
});

describe('App version shown', () => {
  it('Build stamped with its version', async () => {
    // The build's env (next.config.mjs of the app and the site): the root package's version, the commit of CI cut to 7, the day.
    const { buildInfo } = (await import('../../build-info.mjs' as string)) as { buildInfo: () => Record<string, string> };
    const sha = process.env.GITHUB_SHA;
    process.env.GITHUB_SHA = '0123456789abcdef0123456789abcdef01234567';
    try {
      expect(buildInfo()).toEqual({ NEXT_PUBLIC_APP_VERSION: JSON.parse(read('package.json')).version, NEXT_PUBLIC_APP_COMMIT: '0123456', NEXT_PUBLIC_APP_BUILT: new Date().toISOString().slice(0, 10) });
    } finally {
      if (sha === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = sha;
    }
    // Both builds read it.
    for (const f of ['apps/app/next.config.mjs', 'apps/site/next.config.mjs']) expect(read(f)).toMatch(/env: buildInfo\(\)/);
  });
});

describe('Version raised by hand', () => {
  it('Version released with its notes', () => {
    const text = '# Changelog\n\nIntro.\n\n## Unreleased\n\n- Run chart faster.\n- Tags.\n\n## 0.1 — 2026-11-24\n\nThe first version.\n';
    // 0.2 or v0.2 is 0.2.0; anything else no version.
    expect([fullVersion('0.2'), fullVersion('v0.2.1'), fullVersion('1'), fullVersion('next')]).toEqual(['0.2.0', '0.2.1', null, null]);
    // The notes moved under the version and its date, an empty Unreleased above.
    const out = changelogReleased(text, '0.2.0', '2026-12-01');
    expect(out).toBe('# Changelog\n\nIntro.\n\n## Unreleased\n\n## 0.2 — 2026-12-01\n\n- Run chart faster.\n- Tags.\n\n## 0.1 — 2026-11-24\n\nThe first version.\n');
    expect(notesOf(out, '0.2.0')).toBe('- Run chart faster.\n- Tags.');
    expect(notesOf(out, '0.1')).toBe('The first version.');
    expect(notesOf(out, '0.3')).toBeNull();
    // Nothing to release, or the version there already: refused.
    expect(() => changelogReleased(out, '0.3.0', '2026-12-02')).toThrow(/Nothing under/);
    expect(() => changelogReleased(text, '0.1.0', '2026-12-02')).toThrow(/already/);
    // The lock file's root and workspaces set, the dependencies left.
    const lock = { version: '0.1.0', packages: { '': { version: '0.1.0' }, 'apps/app': { version: '0.1.0' }, 'apps/site': { version: '0.1.0' }, 'node_modules/x': { version: '4.0.0' } } };
    expect(lockWithVersion(lock, '0.2.0')).toEqual({ version: '0.2.0', packages: { '': { version: '0.2.0' }, 'apps/app': { version: '0.2.0' }, 'apps/site': { version: '0.2.0' }, 'node_modules/x': { version: '4.0.0' } } });
  });
});
