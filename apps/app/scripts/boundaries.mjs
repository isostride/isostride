// The dependency check between parts (ADRs "Declared dependencies only", "A small shared
// kernel", "Every violation fails the build", "Processing in a Web Worker"). A part is a
// folder with a module.json: { "uses": [parts it may import], "runs": "main"|"worker"|"both",
// "kernel": true, "allow": [packages the kernel may use] }. Rules:
//   undeclared         a part imports a part its module.json does not list
//   internal-access    a part imports another part's file other than its index
//   cycle              parts that depend on each other in a cycle
//   kernel             the kernel imports a part or a package outside its allowlist
//   kernel-size        the kernel holds more than 5% of the source lines
//   main-thread        a main-thread part imports, at run time, a part that runs in the worker
// Each violation names the rule, both parts and the file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = /\.(ts|tsx)$/;
const KERNEL_MAX_SHARE = 5;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(p)) : [p];
  });
}

/** Parts of a source tree: every folder (under the roots) with a module.json. */
export function readParts(root, roots = ['lib', 'app', 'components', 'workers']) {
  const parts = {};
  for (const r of roots) {
    if (!fs.existsSync(path.join(root, r))) continue;
    for (const f of walk(path.join(root, r))) {
      if (path.basename(f) !== 'module.json') continue;
      const name = path.relative(root, path.dirname(f)).split(path.sep).join('/');
      parts[name] = { uses: [], runs: 'both', ...JSON.parse(fs.readFileSync(f, 'utf8')) };
    }
  }
  return parts;
}

const IMPORT = /^\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm;
const BARE = /^\s*import\s+['"]([^'"]+)['"]/gm;

export function checkBoundaries(root, { parts = readParts(root) } = {}) {
  const names = Object.keys(parts).sort((a, b) => b.length - a.length);
  const partOf = (rel) => names.find((p) => rel === p || rel.startsWith(`${p}/`)) ?? null;
  const violations = [];
  const edges = new Map(); // part -> Map(part -> first file)
  let kernelLines = 0;
  let allLines = 0;

  for (const p of Object.keys(parts)) {
    for (const file of walk(path.join(root, p)).filter((f) => SOURCE.test(f) && !f.endsWith('.d.ts'))) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (partOf(rel) !== p) continue; // a nested part's file
      const src = fs.readFileSync(file, 'utf8');
      const lines = src.split('\n').filter((l) => l.trim()).length;
      allLines += lines;
      if (parts[p].kernel) kernelLines += lines;
      const specs = [...src.matchAll(IMPORT)].map((m) => ({ spec: m[4], typeOnly: !!m[2] || /^\{\s*type\s[^,}]*\}$/.test(m[3].trim()) }));
      for (const m of src.matchAll(BARE)) specs.push({ spec: m[1], typeOnly: false });
      for (const { spec, typeOnly } of specs) {
        let target;
        if (spec.startsWith('@/')) target = spec.slice(2);
        else if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
        else {
          // a package: only the kernel is held to an allowlist
          const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
          if (parts[p].kernel && !(parts[p].allow ?? []).includes(pkg) && !pkg.startsWith('node:'))
            violations.push({ rule: 'kernel', from: p, to: pkg, file: rel, message: `the kernel ${p} imports the package ${pkg}, which its allowlist does not hold` });
          continue;
        }
        const q = partOf(target);
        if (!q || q === p) continue;
        if (!edges.has(p)) edges.set(p, new Map());
        if (!edges.get(p).has(q)) edges.get(p).set(q, rel);
        if (target !== q) violations.push({ rule: 'internal-access', from: p, to: q, file: rel, message: `${p} imports ${target}, a file of ${q} other than its index (import '@/${q}')` });
        if (!parts[p].uses.includes(q)) violations.push({ rule: 'undeclared', from: p, to: q, file: rel, message: `${p} imports ${q}, which ${p}/module.json does not list in "uses"` });
        if (parts[p].kernel) violations.push({ rule: 'kernel', from: p, to: q, file: rel, message: `the kernel ${p} imports the part ${q}; the kernel depends on no part` });
        if (parts[p].runs === 'main' && parts[q].runs === 'worker' && !typeOnly)
          violations.push({ rule: 'main-thread', from: p, to: q, file: rel, message: `${p} runs on the main thread and imports ${q}, which runs in the Processing Worker` });
      }
    }
  }

  // Cycles between parts (Tarjan's strongly connected components).
  let index = 0;
  const idx = new Map(), low = new Map(), stack = [], on = new Set();
  const visit = (v) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    for (const w of edges.get(v)?.keys() ?? []) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const scc = [];
      let w;
      do { w = stack.pop(); on.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1) {
        scc.sort();
        const files = scc.flatMap((a) => scc.filter((b) => edges.get(a)?.has(b)).map((b) => `${a} → ${b} (${edges.get(a).get(b)})`));
        violations.push({ rule: 'cycle', from: scc[0], to: scc[1], file: files[0].replace(/.*\((.*)\)$/, '$1'), message: `cycle between ${scc.join(', ')}: ${files.join('; ')}` });
      }
    }
  };
  for (const p of Object.keys(parts)) if (!idx.has(p)) visit(p);

  const kernelShare = allLines ? Math.round((1000 * kernelLines) / allLines) / 10 : 0;
  const kernel = Object.keys(parts).find((p) => parts[p].kernel);
  if (kernel && kernelShare > KERNEL_MAX_SHARE)
    violations.push({ rule: 'kernel-size', from: kernel, to: kernel, file: kernel, message: `the kernel ${kernel} holds ${kernelShare}% of the source lines, more than ${KERNEL_MAX_SHARE}%` });

  const count = (rule) => violations.filter((v) => v.rule === rule).length;
  return {
    violations,
    measures: {
      depsUndeclared: count('undeclared'), depsInternalAccess: count('internal-access'), depsCycles: count('cycle'),
      kernelForbiddenImports: count('kernel'), kernelSharePercent: kernelShare, processingOnMainThreadViolations: count('main-thread'),
      depsViolations: violations.length, parts: Object.keys(parts).length,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? '.';
  const { violations, measures } = checkBoundaries(root);
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(root, 'reports/measures-deps.json'), JSON.stringify(measures, null, 2));
  for (const v of violations) console.error(`✖ ${v.rule}: ${v.message}  [${v.file}]`);
  console.log(`${measures.parts} parts, ${violations.length} violations, kernel ${measures.kernelSharePercent}% of the lines`);
  process.exit(violations.length ? 1 : 0);
}
