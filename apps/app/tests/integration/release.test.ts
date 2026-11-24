import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '../..');
const REPO = path.resolve(APP, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A copy of the files the release touches, in a folder of its own. */
function copy(): string {
  const root = fs.mkdtempSync(path.join(dir, 'repo-'));
  const pkg = (version: string, name: string) => JSON.stringify({ name, version, private: true }, null, 2) + '\n';
  fs.mkdirSync(path.join(root, 'apps/app'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps/site'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), pkg('0.1.0', 'isostride'));
  fs.writeFileSync(path.join(root, 'apps/app/package.json'), pkg('0.1.0', '@isostride/app'));
  fs.writeFileSync(path.join(root, 'apps/site/package.json'), pkg('0.1.0', '@isostride/site'));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'isostride', version: '0.1.0', packages: { '': { version: '0.1.0' }, 'apps/app': { version: '0.1.0' }, 'apps/site': { version: '0.1.0' }, 'node_modules/x': { version: '4.0.0' } } }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- Gear renamed.\n\n## 0.1 — 2026-11-24\n\nThe first version.\n');
  return root;
}
const release = (root: string, ...args: string[]) => execFileSync('node', [path.join(APP, 'scripts/release.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, RELEASE_ROOT: root } });
const json = (root: string, f: string) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));

describe('Version raised by hand', () => {
  it('Release command run', () => {
    const root = copy();
    // npm run release -- 0.2: every package file at 0.2.0, the notes under 0.2 and its date.
    expect(release(root, '0.2')).toMatch(/^Version 0\.2\.0: .* v0\.2\./);
    for (const f of ['package.json', 'apps/app/package.json', 'apps/site/package.json']) expect(json(root, f).version).toBe('0.2.0');
    expect(json(root, 'apps/app/package.json').name).toBe('@isostride/app');
    const lock = json(root, 'package-lock.json');
    expect([lock.version, lock.packages[''].version, lock.packages['apps/app'].version, lock.packages['apps/site'].version, lock.packages['node_modules/x'].version]).toEqual(['0.2.0', '0.2.0', '0.2.0', '0.2.0', '4.0.0']);
    const today = new Date().toISOString().slice(0, 10);
    expect(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toBe(`# Changelog\n\n## Unreleased\n\n## 0.2 — ${today}\n\n- Gear renamed.\n\n## 0.1 — 2026-11-24\n\nThe first version.\n`);
    // The notes the deploy publishes with the tag.
    expect(release(root, 'notes', '0.2.0')).toBe('- Gear renamed.\n');
    // Nothing more to release, or no version given: refused, the files as they are.
    expect(() => release(root, '0.3')).toThrow();
    expect(() => release(root, 'next')).toThrow();
    expect(() => release(root, 'notes', '0.9')).toThrow();
    expect(json(root, 'package.json').version).toBe('0.2.0');
  });

  it('Version tagged on deploy', () => {
    // The deploy job, on master only, may tag (contents: write) and reads the version, its notes and the script.
    const yml = fs.readFileSync(path.join(REPO, '.github/workflows/deploy.yml'), 'utf8');
    const deploy = yml.slice(yml.indexOf('\n  deploy:'));
    expect(deploy).toMatch(/if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/master'/);
    expect(deploy).toMatch(/permissions:\n\s+contents: write\n\s+id-token: write/);
    for (const f of ['package.json', 'CHANGELOG.md', 'apps/app/scripts/release.mjs']) expect(deploy).toContain(`            ${f}\n`);
    // Its step, run as the workflow runs it: the tag of 0.2.0 is v0.2, of 0.2.1 v0.2.1; a release made once.
    const step = deploy.slice(deploy.indexOf('- name: Tag the version'));
    expect(step).toContain('gh release view "$tag"');
    expect(step).toContain('node apps/app/scripts/release.mjs notes "$version" > notes.md');
    expect(step).toContain('gh release create "$tag" --target "$GITHUB_SHA"');
    const tagLine = step.split('\n').find((l) => l.trim().startsWith('tag='))!.trim();
    const tagOf = (version: string) => execFileSync('bash', ['-c', `version=${version}; ${tagLine}; echo "$tag"`], { encoding: 'utf8' }).trim();
    expect([tagOf('0.2.0'), tagOf('0.2.1'), tagOf('1.0.0')]).toEqual(['v0.2', 'v0.2.1', 'v1.0']);
  });
});
