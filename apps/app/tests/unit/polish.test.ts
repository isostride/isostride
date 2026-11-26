import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { REASONS, SHOWN_WORDS, basisOf, reasonText, ruleName, ruleOf, shownName, type RuleShape } from '@/lib/blocks';
import { IMPORT_REASONS, importReason, readReason } from '@/lib/fs';
import { dateText, loadLocale, number, setLocale, t, tn } from '@/lib/i18n';
import { formSeries, performanceReport, type BestOfLength, type LoadSummary } from '@/lib/load';
import { DEFAULT_PERFORMANCE } from '@/lib/settings';

/**
 * What the processing code writes for the screens, in Polish (requirement "App in English and Polish"):
 * the names of segments, the reasons of an effort left out or a file not imported, the models' texts.
 * What is saved in the data folder stays English; it is shown in the language in use.
 */
// The language loaded and the browser's own formats of it used once before any test: on a slow machine their
// first use took longer than a unit test may (the pipeline's limit of 100 ms, scaled to the machine).
beforeAll(async () => {
  await loadLocale('pl');
  setLocale('pl');
  number(1234.5, 1);
  dateText(new Date('2026-11-24T12:00:00'), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  tn(2, '{n} run', '{n} runs');
  setLocale('en');
});
// The reasons' patterns are built once, on their first reading.
beforeAll(() => { reasonText(Object.values(REASONS)[0]); });
afterEach(() => setLocale('en'));

/** A text left with a placeholder unfilled, or a number with a decimal point in Polish. */
const flawed = (s: string) => /\{\w+\}/.test(s) || /\d\.\d/.test(s.replace(/\d+\.\d+\.\d+/g, ''));

const SHAPES: RuleShape[] = [
  { type: 'run' },
  { type: 'lap' },
  { type: 'lap', planned: { kind: 'distance', target: 1000, tolerance: 0.1 } },
  { type: 'lap', planned: { kind: 'time', target: 300, tolerance: 0.1 } },
  { type: 'fastest', kind: 'time', target: 300 },
  { type: 'fastest', kind: 'distance', target: 5000, effort: true },
  { type: 'steady', minDuration: 1200 },
  { type: 'route', track: [], length: 5200, heading: 45 },
];

describe('Shown in Polish', () => {
  it('Segment names shown in the language chosen', () => {
    for (const shape of SHAPES) {
      const rule = ruleOf(shape);
      rule.runs = { ...rule.runs, dateFrom: '2026-03-01', title: 'COROS' };
      rule.conditions = { ...rule.conditions, paceMin: 240, paceMax: 300, hrMin: 160 };
      // Saved in English, as before.
      const saved = ruleName(rule);
      setLocale('pl');
      const shown = shownName(saved, rule);
      expect(shown, saved).toBe(ruleName(rule, SHOWN_WORDS));
      expect(shown, saved).not.toBe(saved);
      expect(flawed(shown), shown).toBe(false);
      // A name the runner typed is shown as typed.
      expect(shownName('Promenade loop', rule)).toBe('Promenade loop');
      // What a suggestion was found from, with its counts in Polish forms.
      for (const [runs, accepted] of [[1, 1], [3, 2], [12, 5]]) {
        const basis = basisOf({ params: rule as never, tolerances: {} as never, runs, instances: runs * 2, accepted });
        expect(flawed(basis), basis).toBe(false);
      }
      setLocale('en');
    }
  });

  it('Reasons shown in the language chosen', () => {
    const filled = (key: string) => key.replace(/\{(\w+)\}/g, (_, k: string) => (/pace|from|to/.test(k) ? '5:10' : k === 'cv' ? '0.22' : '12'));
    setLocale('pl');
    for (const key of Object.values(REASONS)) {
      const text = reasonText(filled(key));
      expect(text, key).not.toBe(filled(key));
      expect(flawed(text), text).toBe(false);
    }
    // A reason the app does not know is shown as it is.
    expect(reasonText('something else')).toBe('something else');
    // A file not imported: saved in English with its values, read back and shown in Polish.
    for (const key of Object.values(IMPORT_REASONS)) {
      const saved = importReason(key, { error: 'bad header', sport: 'cycling', path: 'fit/a.fit' });
      const read = readReason(saved)!;
      expect(read.key).toBe(key);
      expect(t(read.key, read.vars)).not.toBe(saved);
    }
    expect(readReason('nothing like a reason')).toBeNull();
  });

  it('Models explained in the language chosen', () => {
    const best = (duration: number, speed: number, hr: number): BestOfLength => ({ duration, speed, power: null, speedAt: [600, 600 + duration], speedHr: hr, speedHrPeak: hr });
    const summary = (bests: BestOfLength[]): LoadSummary => ({ duration: 3600, hrFrom: 150, hr: [3600], hrPeak: 178, normSpeed: 3.5, normPower: null, bests, moving: 3600, avgHr: 150, ef: 1.4, decoupling: 2 });
    const rows = ['2026-11-01', '2026-11-05', '2026-11-10'].map((d, i) => ({ id: `r${i}`, startTime: `${d}T07:00:00`, duration: 3600, load: 80, device: 'COROS PACE 4', heartRateSource: 'Arm band' }));
    const summaries = { r0: summary([best(120, 5, 172), best(180, 4.8, 174)]), r1: summary([best(300, 4.6, 170), best(600, 4.35, 168)]), r2: summary([best(1200, 4.15, 166)]) };
    const performance = { ...DEFAULT_PERFORMANCE, maxHr: 185, confirmed: true };
    const build = () => {
      const days = formSeries(rows.map((r) => ({ startTime: r.startTime, load: r.load })), performance, '2026-11-21');
      return performanceReport({ rows, summaries, performance, hrZones: [114, 133, 152, 171], zonesOwn: true, days, today: '2026-11-21' });
    };
    const en = build();
    setLocale('pl');
    const pl = build();
    // The same models and checks, every name in Polish, no value left unfilled.
    expect(pl.models.map((m) => [m.key, m.trust, m.checks.map((c) => c.status)])).toEqual(en.models.map((m) => [m.key, m.trust, m.checks.map((c) => c.status)]));
    for (const [i, m] of pl.models.entries()) {
      expect(m.name).not.toBe(en.models[i].name);
      for (const text of [m.name, m.method, m.tells, ...m.inputs, ...m.checks.flatMap((c) => [c.label, c.detail])]) expect(flawed(text), text).toBe(false);
    }
  });
});
