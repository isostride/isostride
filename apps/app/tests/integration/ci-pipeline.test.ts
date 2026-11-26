import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../../../..');
const yml = fs.readFileSync(path.join(REPO, '.github/workflows/deploy.yml'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** The text of a job of the workflow: from its name to the next job. */
function job(name: string): string {
  const from = yml.indexOf(`\n  ${name}:\n`);
  expect(from).toBeGreaterThan(-1);
  const next = yml.slice(from + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return yml.slice(from, next < 0 ? undefined : from + 1 + next);
}

/** The script of a step of a job (its `run: |` block), as the workflow runs it. */
function script(of: string, step: string): string {
  const lines = of.slice(of.indexOf(`- name: ${step}`)).split('\n');
  const at = lines.findIndex((l) => l.trim() === 'run: |');
  const indent = lines[at].indexOf('run:') + 2;
  const body: string[] = [];
  for (const l of lines.slice(at + 1)) { if (l.trim() && l.search(/\S/) < indent) break; body.push(l.slice(indent)); }
  return body.join('\n');
}

/**
 * A tree is checked once (the runner's "chce aby ci/cd dzialal stabilnie ... jesli check przechodzi na
 * branchu to pwinien przechodzic na merge do main", 26 Nov 2026): the check that passes on a pull request
 * marks its tree, and the push to master of that tree runs no test again.
 */
describe('CI/CD pipeline', () => {
  it("Nothing of the runner's leaves the pipeline", () => {
    // The tests' own output goes to the run's reports, not to the public log (scripts/quiet.mjs).
    const check = fs.readFileSync(path.join(REPO, 'apps/app/scripts/check.sh'), 'utf8');
    for (const line of check.split('\n').filter((l) => /npx (vitest run|playwright test)/.test(l) && !/^\s*#/.test(l) && /--(shard|coverage|project unit)/.test(l))) expect(line).toContain('node scripts/quiet.mjs');
    expect(fs.readFileSync(path.join(REPO, 'apps/app/scripts/nightly.sh'), 'utf8')).toMatch(/node scripts\/quiet\.mjs "shuffled-\$run"/);
    // The builds the deploy ships are handed on as artifacts of their own run: never read back from the bucket.
    expect(yml).not.toMatch(/\$REPORTS\/build/);
    expect(job('e2e')).toContain('name: build-app');
    expect(job('static')).toContain('name: build-site');
    expect(job('check')).toContain('name: build-app');
    // No coordinate of the runner's routes in a test: none of them compares a latitude or a longitude with a number.
    const tests = path.join(REPO, 'apps/app/tests');
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
    for (const f of files(tests)) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/\.l(at|on)(\[\w+\])?\)?\s*(\)\.toBeCloseTo\(|[<>]=?\s*)-?\d+\.\d{3,}/);
    // The policy both sites answer with, the one the end-to-end tests run under, on a fixed day.
    const csp = JSON.parse(fs.readFileSync(path.join(REPO, 'infra/csp.json'), 'utf8')) as Record<string, string>;
    for (const site of ['app', 'site']) {
      expect(csp[site]).toMatch(/default-src 'self'/);
      expect(csp[site]).toMatch(/object-src 'none'/);
      expect(csp[site]).toMatch(/frame-ancestors 'none'/);
    }
    expect(csp.app).toMatch(/connect-src 'self' https:\/\/\*\.coros\.com;/);
    expect(fs.readFileSync(path.join(REPO, 'infra/main.tf'), 'utf8').match(/jsondecode\(file\("\$\{path\.module\}\/csp\.json"\)\)\.(app|site)/g)).toHaveLength(2);
    const config = fs.readFileSync(path.join(REPO, 'apps/app/playwright.config.ts'), 'utf8');
    expect(config).toContain('static-server.mjs .next-build 4173 app');
    expect(config).toContain('static-server.mjs ../site/.next-build 4174 site');
    expect(fs.readFileSync(path.join(REPO, 'apps/app/e2e/support.ts'), 'utf8')).toContain('await page.clock.install({ time: TEST_NOW });');
  });

  it('A tree checked once is not checked again', () => {
    // The step that asks, run as the workflow runs it, with an `aws` that answers as the bucket would.
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const calls = path.join(dir, 'calls');
    fs.writeFileSync(path.join(bin, 'aws'), `#!/bin/sh\necho "$@" >> "${calls}"\n[ "$MARK" = there ]\n`, { mode: 0o755 });
    const asked = (event: string, mark: 'there' | 'none') => {
      fs.rmSync(calls, { force: true });
      const out = path.join(dir, `out-${event}-${mark}`);
      fs.writeFileSync(out, '');
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script(job('known'), 'The tree and its mark')], {
        cwd: REPO, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: out, TEST_DATA_BUCKET: 'bucket', MARK: mark },
      });
      const values = Object.fromEntries(fs.readFileSync(out, 'utf8').trim().split('\n').map((l) => l.split('=')));
      return { ...values, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim() : '' };
    };
    const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: REPO, encoding: 'utf8' }).trim();
    // A push to master of a tree whose check passed: checked before; the mark is asked for by the tree's hash.
    expect(asked('push', 'there')).toEqual({ tree, checked: 'true', calls: `s3api head-object --bucket bucket --key ci/checked/${tree}` });
    // No mark (a push straight to master, or a mark gone after 3 days): checked whole.
    expect(asked('push', 'none')).toMatchObject({ tree, checked: 'false' });
    // A pull request is always checked whole: its check is the one that counts, and the bucket is not asked.
    expect(asked('pull_request', 'there')).toEqual({ tree, checked: 'false', calls: '' });
    // A run started by hand follows the mark, as a push does.
    expect(asked('workflow_dispatch', 'there')).toMatchObject({ checked: 'true' });

    // Every stage of the check waits for the answer and is left out for a tree checked before.
    for (const name of ['tests', 'shuffled', 'e2e', 'e2e-webkit', 'static']) {
      expect(job(name)).toContain('    needs: known\n');
      expect(job(name)).toContain("    if: needs.known.outputs.checked != 'true'\n");
    }
    // The verdict runs whenever the tree was not checked before, also when a job before it failed (then
    // it fails: a pull request never passes on a check left out), and marks the tree only when every job passed.
    const check = job('check');
    expect(check).toContain("    if: ${{ !cancelled() && needs.known.outputs.checked != 'true' }}\n");
    const mark = check.slice(check.indexOf('- name: Mark the tree as checked'));
    expect(mark.indexOf('- name: Mark the tree as checked')).toBeGreaterThan(-1);
    expect(check.indexOf('- name: Verdict')).toBeLessThan(check.indexOf('- name: Mark the tree as checked'));
    for (const name of ['tests', 'shuffled', 'e2e', 'e2e-webkit', 'static']) expect(mark).toContain(`needs.${name}.result == 'success'`);
    expect(mark).toContain('if: ${{ success() && ');
    expect(mark).toContain('"s3://${TEST_DATA_BUCKET}/ci/checked/${{ needs.known.outputs.tree }}"');
    // A tree checked before is built with master's commit, and the deploy takes that build or the whole
    // check of the run, never less.
    const build = job('build');
    expect(build).toContain("    if: needs.known.outputs.checked == 'true'\n");
    expect(build).toContain('npm run -s build');
    const deploy = job('deploy');
    expect(deploy).toContain('    needs: [known, tests, shuffled, e2e, e2e-webkit, static, check, build]\n');
    expect(deploy).toContain("((needs.known.outputs.checked == 'true' && needs.build.result == 'success') || (needs.known.outputs.checked != 'true' && needs.tests.result == 'success' && needs.shuffled.result == 'success' && needs.e2e.result == 'success' && needs.e2e-webkit.result == 'success' && needs.static.result == 'success' && needs.check.result == 'success'))");
  });
});
