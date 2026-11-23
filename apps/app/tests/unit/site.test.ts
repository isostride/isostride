import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SITE = path.resolve(__dirname, '../../../site');
const page = fs.readFileSync(path.join(SITE, 'app/page.tsx'), 'utf8');

describe('Site in plain statements', () => {
  it('Site says what it is', () => {
    // The heading says what it is; the sections, in their order.
    expect(page).toContain('<h1>IsoStride is an open platform for analysing your runs.</h1>');
    const sections = [...page.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(sections).toEqual(['Why it exists', 'Local and open source', 'Analysis of metrics', 'Performance models', 'An open platform', 'Getting started']);
    // Why: training logs with limited analysis, few open tools; no replacement for a log.
    expect(page).toMatch(/Most running apps are training logs\./);
    expect(page).toMatch(/Their tools for analysing and comparing the data are limited\./);
    expect(page).toMatch(/Open tools of this kind for running are hard to find\./);
    expect(page).toMatch(/It does not replace your training log\./);
    // Local and open: no server, no account, nothing uploaded.
    expect(page).toMatch(/There is no server and no account\./);
    expect(page).toMatch(/never uploaded/);
    // The models with the methods they are taken from.
    for (const method of ['Banister TRIMP (1991)', 'Edwards TRIMP (1993)', 'Monod and Scherrer (1965)', 'Riegel’s power law (1981)', 'Daniels and Gilbert (1979)', 'Seiler']) expect(page, method).toContain(method);
    // Open to models and analyses of one's own, and an invitation to code or ideas.
    expect(page).toMatch(/Your own model/);
    expect(page).toMatch(/Your own analysis/);
    expect(page).toMatch(/Code or ideas, both help\./);
    // Screenshots of the whole app on demo data only: a made-up runner, critical speed about 3:15 /km.
    expect(page).toMatch(/demo data of a made-up runner with a critical speed of about 3:15 \/km/);
    const shots = [...page.matchAll(/<Shot name="([a-z]+)"/g)].map((m) => m[1]);
    expect(shots.length).toBeGreaterThanOrEqual(5);
    for (const s of shots) expect(fs.existsSync(path.join(SITE, 'public/shots', `${s}.webp`)), s).toBe(true);
    // A single button to the app, in the top bar: not 3.
    const toApp = [...page.matchAll(/<a className="btn[^"]*" href=\{APP_URL\}/g)];
    expect(toApp).toHaveLength(1);
    expect(page.indexOf(toApp[0][0])).toBeLessThan(page.indexOf('</header>'));
  });
});
