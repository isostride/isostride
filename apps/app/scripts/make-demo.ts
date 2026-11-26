// The demo folder written to disk: the two years of the demo runner (lib/demo) as FIT files, imported,
// with what the runner would have entered — what the app makes in the browser when it is opened on the
// demo (?demo), here in a folder of yours, to open in the app or to look into.
//
//   npx tsx --tsconfig tsconfig.json scripts/make-demo.ts <folder> [the day it ends on, YYYY-MM-DD; today by default] [en|pl]
import fs from 'node:fs';
import { seedDemo } from '@/lib/pipeline';
import { NodeFolder } from '../tests/support/nodeFolder';

const [out, day, lang] = process.argv.slice(2);
if (!out) throw new Error('usage: npx tsx --tsconfig tsconfig.json scripts/make-demo.ts <folder> [YYYY-MM-DD] [en|pl]');
const now = day ? new Date(`${day}T21:00:00`) : new Date();
fs.mkdirSync(out, { recursive: true });
const folder = new NodeFolder(out);
let made = await seedDemo(folder, { part: 'recent', lang: lang === 'pl' ? 'pl' : 'en', now });
let runs = made.imported;
while (made.remaining > 0) {
  made = await seedDemo(folder, { part: 'more', lang: lang === 'pl' ? 'pl' : 'en', now });
  if (!made.imported) break;
  runs += made.imported;
}
console.log(`${runs} runs added, ${made.total} in all, in ${out}`);
