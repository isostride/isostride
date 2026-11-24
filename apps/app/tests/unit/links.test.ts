import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('Settings in tabs', () => {
  it('Links lead to a tab there is', () => {
    // The tabs of Settings, as its page lists them, in their order (Models first: "tab models daj jako pierwsze").
    const page = fs.readFileSync(path.join(ROOT, 'app/settings/page.tsx'), 'utf8');
    const tabs = [...page.match(/const TABS: \[Tab, string\]\[\] = \[(.*)\];/)![1].matchAll(/\['(\w+)', '([^']+)'\]/g)].map((m) => [m[1], m[2]]);
    expect(tabs).toEqual([['models', 'Models'], ['metrics', 'Metrics'], ['gears', 'Gears'], ['tags', 'Tags'], ['display', 'Look & feel'], ['language', 'Language & region'], ['about', 'About']]);
    // Every link to a tab, from any screen (the palette, To do, A/B, the setup, Performance), names one of them.
    const links: string[] = [];
    for (const dir of ['app', 'components'])
      for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true }) as string[])
        if (/\.tsx?$/.test(f)) for (const m of fs.readFileSync(path.join(ROOT, dir, f), 'utf8').matchAll(/settings\?tab=(\w+)/g)) links.push(`${f}: ${m[1]}`);
    expect(links.length).toBeGreaterThan(5);
    expect(links.filter((l) => !tabs.some(([t]) => l.endsWith(`: ${t}`)))).toEqual([]);
  });
});
