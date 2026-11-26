// "Only React" (ADR "Built with React"): no package.json of the repository declares another UI
// framework, unless an accepted decision record names that package. Exits 1 on a violation.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OTHER_FRAMEWORKS = ['@angular/core', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', 'solid-js', 'preact', 'lit', 'ember-source', '@builder.io/qwik'];

/** Packages an accepted ADR allows: its decision names the package. */
export function allowedByAdrs(modelDir) {
  const allowed = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(modelDir).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(f, 'utf8');
    if (!/^type: "adr"/m.test(text) || !/^status: "accepted"/m.test(text)) continue;
    const decision = text.match(/^decision: "(.*)"$/m)?.[1] ?? '';
    for (const p of OTHER_FRAMEWORKS) if (decision.includes(`\`${p}\``) || decision.includes(`package ${p}`)) allowed.add(p);
  }
  return allowed;
}

export function otherFrameworks(packageJsons, allowed = new Set()) {
  return packageJsons.flatMap(({ file, json }) =>
    Object.keys({ ...json.dependencies, ...json.devDependencies })
      .filter((d) => OTHER_FRAMEWORKS.includes(d) && !allowed.has(d))
      .map((d) => `${file} declares ${d}, another UI framework; an accepted decision record must allow it`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // From the top of the repository (':/'), whatever folder this runs in: from the app's own, only the app's
  // package.json was looked at, and the site or the root could declare another framework unseen.
  const files = execSync("git ls-files -- ':/*package.json'", { encoding: 'utf8' }).split('\n').filter(Boolean);
  const found = otherFrameworks(files.map((file) => ({ file, json: JSON.parse(fs.readFileSync(file, 'utf8')) })), allowedByAdrs('../../.radical/model'));
  for (const f of found) console.error(`✖ ${f}`);
  process.exit(found.length ? 1 : 0);
}
