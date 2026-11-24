---
id: "f3de29b6-3564-4a94-96f5-ea8dd99f97ec"
type: "adr"
label: "Version from package.json"
alternatives: |
  1. A number raised on every merge: chosen against by the runner.
  2. The version in a file of its own: package.json already holds one, which npm and the tools read.
consequences: |
  • One number, set in one command; the commit tells builds of one version apart.
  • A file in .isostride/ says which version and commit wrote it, for a bug report.
  • The deploy job needs contents: write to tag.
  • A unit test holds the package files equal and CHANGELOG.md with a section of the current version.
context: "The runner asked for versioning, 0.1 now, raised by hand with release notes, shown in the app, on the site and in the data folder."
date: "2026-11-24"
decision: "The version is the one of the root package.json (semantic, 0.1.0), the app's and the site's kept equal to it. The builds read it, with the commit (GITHUB_SHA in CI, git otherwise) and the build date, into NEXT_PUBLIC_APP_VERSION, NEXT_PUBLIC_APP_COMMIT and NEXT_PUBLIC_APP_BUILT; lib/kernel/version.ts gives them to every part, the worker included (APP_VERSION, APP_COMMIT, APP_BUILT, appVersionLabel: 0.1.0 shown as 0.1). lib/fs writeJson adds to every object it writes a field app: { version, commit }. scripts/release.mjs (npm run release -- 0.2) sets the version in the package files and moves the Unreleased notes of CHANGELOG.md under the new version and date; the deploy job tags the deployed commit v<version> and makes a GitHub release of its notes when the tag is not there yet."
status: "accepted"
---
