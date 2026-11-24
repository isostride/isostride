// Raising the version by hand (requirement "Version raised by hand"; ADR "Version from package.json"):
//   npm run release -- 0.2      sets 0.2.0 in every package.json and package-lock.json, and moves the
//                               Unreleased notes of CHANGELOG.md under "## 0.2 — <date>"
//   node release.mjs notes 0.2  prints the notes of a version (the deploy job's GitHub release)
// The deploy job tags the deployed commit v0.2 once it is on master.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The repository; another copy of it for the test of this script (RELEASE_ROOT).
const ROOT = process.env.RELEASE_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PACKAGES = ['package.json', 'apps/app/package.json', 'apps/site/package.json'];

/** A version given as 0.2 or 0.2.0, as package.json holds it: 0.2.0. Null for anything else. */
export function fullVersion(v) {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(v ?? '').trim());
  return m ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3] ?? 0)}` : null;
}

/** A version as shown and tagged: a patch of 0 left out (0.2.0 → 0.2). */
export const versionLabel = (v) => v.replace(/^(\d+\.\d+)\.0$/, '$1');

/** package-lock.json with the version of the root and of the workspaces set. */
export function lockWithVersion(lock, version) {
  const out = { ...lock, version, packages: { ...lock.packages } };
  for (const key of ['', 'apps/app', 'apps/site']) if (out.packages[key]) out.packages[key] = { ...out.packages[key], version };
  return out;
}

/**
 * CHANGELOG.md with the notes under "## Unreleased" moved under "## <label> — <date>", a fresh
 * empty Unreleased above them. Throws when there is nothing to release or the version is there already.
 */
export function changelogReleased(text, version, date) {
  const label = versionLabel(version);
  if (new RegExp(`^## ${label.replace(/\./g, '\\.')}( |$)`, 'm').test(text)) throw new Error(`CHANGELOG.md has ${label} already`);
  const m = /^## Unreleased[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) throw new Error('CHANGELOG.md has no "## Unreleased" section');
  const notes = m[1].trim();
  if (!notes) throw new Error('Nothing under "## Unreleased" to release');
  return text.slice(0, m.index) + `## Unreleased\n\n## ${label} — ${date}\n\n${notes}\n\n` + text.slice(m.index + m[0].length);
}

/** The notes of a version in CHANGELOG.md, null when it has no section. */
export function notesOf(text, version) {
  const label = versionLabel(fullVersion(version) ?? version);
  const m = new RegExp(`^## ${label.replace(/\./g, '\\.')}(?: [^\\n]*)?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(text);
  return m ? m[1].trim() : null;
}

function main(args) {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
  if (args[0] === 'notes') {
    const notes = notesOf(read('CHANGELOG.md'), args[1]);
    if (notes === null) { console.error(`No notes of ${args[1]} in CHANGELOG.md`); process.exit(1); }
    console.log(notes);
    return;
  }
  const version = fullVersion(args[0]);
  if (!version) { console.error('Usage: npm run release -- <version>, e.g. 0.2'); process.exit(1); }
  const changelog = changelogReleased(read('CHANGELOG.md'), version, new Date().toISOString().slice(0, 10));
  for (const f of PACKAGES) write(f, JSON.stringify({ ...JSON.parse(read(f)), version }, null, 2) + '\n');
  write('package-lock.json', JSON.stringify(lockWithVersion(JSON.parse(read('package-lock.json')), version), null, 2) + '\n');
  write('CHANGELOG.md', changelog);
  console.log(`Version ${version}: package files and CHANGELOG.md updated; commit, open a pull request, and after the merge the deploy tags v${versionLabel(version)}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
