import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeFolder } from '../../tests/support/nodeFolder';
import { importFolder, type RunsIndex } from '../../lib/ingest/importFolder';
import { PATHS, readJson } from '../../lib/fs/folder';
import { RECOMMENDATIONS_PATH, writeDefinitions, fromRecommendation } from '../../lib/blocks/definitions';
import { runBlocks } from '../../lib/blocks/pipeline';
import type { BlockInstancesFile, Recommendation } from '../../lib/blocks/types';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-acc-'));
fs.mkdirSync(path.join(root, 'fit'));
for (const f of fs.readdirSync('test_data/coros_fit_2026').filter((f) => f.endsWith('.fit'))) fs.copyFileSync(`test_data/coros_fit_2026/${f}`, path.join(root, 'fit', f));
const folder = new NodeFolder(root);
let t0 = performance.now();
await importFolder(folder);
console.log('import all', Math.round(performance.now() - t0), 'ms');
const recs = (await readJson<{ recommendations: Recommendation[] }>(folder, RECOMMENDATIONS_PATH))!.recommendations;
for (const r of recs) console.log('REC', r.name, '|', r.basis, '| band', r.tolerances.paceMin, r.tolerances.paceMax);
await writeDefinitions(folder, recs.map((r) => fromRecommendation(r, 'active')));
t0 = performance.now();
const rep = await runBlocks(folder);
console.log('blocks', rep, Math.round(performance.now() - t0), 'ms');
const inst = (await readJson<BlockInstancesFile>(folder, PATHS.blockInstances))!.instances;
const defsFile = JSON.parse(fs.readFileSync(path.join(root, PATHS.blockDefinitions), 'utf8')).definitions;
for (const d of defsFile) {
  const mine = inst.filter((i) => i.definitionId === d.id);
  const acc = mine.filter((i) => i.status === 'accepted');
  const since = acc.filter((i) => i.runStart >= '2026-08-03');
  const reasons: Record<string, number> = {};
  for (const i of mine) for (const r of i.reasons) { const k = r.split(':')[0]; reasons[k] = (reasons[k] ?? 0) + 1; }
  console.log(d.name, 'instances', mine.length, 'accepted', acc.length, 'since Aug3', since.length, 'hrValid', since.filter((i) => i.heartRate.valid).length, JSON.stringify(reasons));
  if (d.params.type === 'route') {
    const pts = since.filter((i) => i.heartRate.valid).map((i) => `${i.runStart.slice(5, 10)}:${Math.round(i.metrics.heartRate ?? 0)}`);
    console.log('   HR', pts.join(' '));
  }
}
