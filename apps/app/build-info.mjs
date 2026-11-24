// The version, commit and date of a build (ADR "Version from package.json"), for next.config.mjs of
// the app and the site: the version of the root package.json, the commit of CI (GITHUB_SHA) or of git.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

/** NEXT_PUBLIC_APP_VERSION, NEXT_PUBLIC_APP_COMMIT and NEXT_PUBLIC_APP_BUILT for the build's env. */
export function buildInfo() {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  let commit = process.env.GITHUB_SHA ?? '';
  if (!commit) {
    try { commit = execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = ''; }
  }
  return {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: commit.slice(0, 7),
    NEXT_PUBLIC_APP_BUILT: new Date().toISOString().slice(0, 10),
  };
}
