import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dateText, loadLocale, localeOf, msg, number, setLocale, t, tn } from '@/lib/i18n';
import { km } from '@/lib/format';

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
afterEach(() => setLocale('en'));

describe('App in English and Polish', () => {
  it('Text shown in the language chosen', () => {
    // The English text is the key; a value fills its place.
    expect(t('Runs')).toBe('Runs');
    expect(t('Version {version}', { version: '0.1' })).toBe('Version 0.1');
    setLocale('pl');
    expect(t('Runs')).toBe('Biegi');
    expect(t('Version {version}', { version: '0.1' })).toBe('Wersja 0.1');
    expect(t(msg('Settings'))).toBe('Ustawienia');
    // A text with no translation stays as it is (a name from a file).
    expect(t('Air Power')).toBe('Air Power');
  });

  it('Counts in the forms of the language', () => {
    expect(tn(1, '{n} run', '{n} runs')).toBe('1 run');
    expect(tn(3, '{n} run', '{n} runs')).toBe('3 runs');
    setLocale('pl');
    // Polish: 1 bieg, 2–4 biegi, 5 and more biegów, 22 biegi, a fraction biegu (its comma too).
    expect([1, 3, 5, 12, 22, 1.5].map((n) => tn(n, '{n} run', '{n} runs'))).toEqual(['1 bieg', '3 biegi', '5 biegów', '12 biegów', '22 biegi', '1,5 biegu']);
  });

  it('Numbers and dates in the language chosen', () => {
    expect(number(5.236, 2)).toBe('5.24');
    expect(km(5236)).toBe('5.24');
    expect(dateText('2026-11-24T12:00:00', { day: 'numeric', month: 'short', year: 'numeric' })).toBe('Nov 24, 2026');
    setLocale('pl');
    expect(number(5.236, 2)).toBe('5,24');
    expect(km(5236)).toBe('5,24');
    expect(number(1234.5, 1)).toBe('1234,5');
    expect(dateText('2026-11-24T12:00:00', { day: 'numeric', month: 'short', year: 'numeric' })).toBe('24 lis 2026');
  });

  it('Language from the browser', () => {
    expect(localeOf(['pl-PL', 'en-US'])).toBe('pl');
    expect(localeOf(['de-DE', 'pl'])).toBe('pl');
    expect(localeOf(['de-DE', 'fr'])).toBe('en');
    expect(localeOf(['en-GB', 'pl'])).toBe('en');
    expect(localeOf([])).toBe('en');
  });
});
