import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../site/app/content';

const SITE = path.resolve(__dirname, '../../../site');
const home = fs.readFileSync(path.join(SITE, 'app/Home.tsx'), 'utf8');
const en = CONTENT.en;
/** Every text of a page's content, joined (the nodes with links and code read as their strings). */
const all = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(all).join(' ') : v && typeof v === 'object' ? Object.values(v as Record<string, unknown>).map(all).join(' ') : '');
const text = all(en);

describe('Site in plain statements', () => {
  it('Site says what it is', () => {
    // The heading says what it is; the sections, in their order.
    expect(en.hero.h1).toBe('IsoStride is an open platform for analysing your runs.');
    expect(home).toContain('<span className="wordmark">IsoStride</span>');
    expect([en.why.h2, en.local.h2, en.metrics.h2, en.models.h2, en.open.h2, en.start.h2]).toEqual(['Why it exists', 'Local and open source', 'Analysis of metrics', 'Performance models', 'An open platform', 'Getting started']);
    // Why: training logs with limited analysis, few open tools; no replacement for a log.
    expect(text).toMatch(/Most running apps are training logs\./);
    expect(text).toMatch(/Their tools for analysing and comparing the data are limited\./);
    expect(text).toMatch(/Open tools of this kind for running are hard to find\./);
    expect(text).toMatch(/It does not replace your training log\./);
    // Local and open: no server, no account, nothing uploaded.
    expect(text).toMatch(/There is no server and no account\./);
    expect(text).toMatch(/never uploaded/);
    // The models with the methods they are taken from.
    for (const method of ['Banister TRIMP (1991)', 'Edwards TRIMP (1993)', 'Monod and Scherrer (1965)', 'Riegel’s power law (1981)', 'Daniels and Gilbert (1979)', 'Seiler']) expect(text, method).toContain(method);
    // Open to models and analyses of one's own, and an invitation to code or ideas.
    expect(text).toMatch(/Your own model/);
    expect(text).toMatch(/Your own analysis/);
    expect(text).toMatch(/Code or ideas, both help\./);
    // Screenshots of the whole app on demo data only: a made-up runner, critical speed about 3:15 /km.
    expect(text).toMatch(/demo data of a made-up runner with a critical speed of about 3:15 \/km/);
    const shots = ['dashboard', ...en.metrics.shots.map(([name]) => name), ...en.models.shots.map(([name]) => name)];
    expect(shots.length).toBeGreaterThanOrEqual(5);
    for (const s of shots) expect(fs.existsSync(path.join(SITE, 'public/shots', `${s}.webp`)), s).toBe(true);
    // A single button to the app, in the top bar: not 3.
    const toApp = [...home.matchAll(/<a className="btn[^"]*" href=\{APP_URL\}/g)];
    expect(toApp).toHaveLength(1);
    expect(home.indexOf(toApp[0][0])).toBeLessThan(home.indexOf('</header>'));
  });

  it('Site says the same in Polish', () => {
    // Requirement "Site in English and Polish": the same page, as many sections, rows and pictures, each text in Polish.
    const pl = CONTENT.pl;
    const shape = (c: typeof en) => [c.nav.length, c.why.paragraphs.length, c.local.qa.length, c.metrics.rows.length, c.metrics.shots.map(([n]) => n), c.models.rows.length, c.models.shots.map(([n]) => n), c.open.rows.length, c.start.steps.length];
    expect(shape(pl)).toEqual(shape(en));
    expect(pl.hero.h1).toBe('IsoStride: otwarta platforma do analizy biegów.');
    expect([pl.why.h2, pl.local.h2, pl.metrics.h2, pl.models.h2, pl.open.h2, pl.start.h2]).toEqual(['Dlaczego IsoStride', 'Dane zostają u Ciebie', 'Analiza metryk', 'Modele wydolności', 'Otwarty kod, otwarta platforma', 'Jak zacząć']);
    // Its screenshots are of the app in Polish, each there (apps/site/public/shots/pl).
    for (const s of ['dashboard', ...pl.metrics.shots.map(([n]) => n), ...pl.models.shots.map(([n]) => n)]) expect(fs.existsSync(path.join(SITE, 'public/shots/pl', `${s}.webp`)), s).toBe(true);
    // No English sentence left in the Polish page.
    const plText = all(pl);
    for (const sentence of ['There is no server', 'training logs', 'Getting started', 'Open full size']) expect(plText).not.toContain(sentence);
  });
});
