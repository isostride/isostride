import { asRule, shownName, type BlockDefinition, type BlockParams } from '@/lib/blocks';
import { dateText, msg, number, t } from '@/lib/i18n';
import { minSec } from '@/lib/kernel';

/** A run's name in the Analysis screen: its title if any, its date and its distance. */
export const runName = (start: string, distance: number, title?: string | null) =>
  `${title ? `${title} · ` : ''}${dateText(start, { day: 'numeric', month: 'short', year: 'numeric' })} · ${number(distance / 1000, 1)} km`;

/** The kinds of block, in words (shown through t()). */
export const TYPE_LABEL: Record<BlockParams['type'], string> = {
  route: msg('route segment'), structure: msg('workout lap'), steady: msg('steady fragment'), effort: msg('effort, any route'), tag: msg('workout type'), pattern: msg('lap pattern'), rule: msg('rule'), profile: msg('same profile, any route'),
};

/**
 * The name of a segment found like a part of a run (Find similar), kept in English as it is saved:
 * "Same route as Nov 24, 2026 · 5.2 km · 5:10 /km ±10 %", or "… as the selection".
 */
export function similarName(kind: 'route' | 'profile', ref: { runStart: string; distance: number; pace: number } | null): string {
  const what = ref
    // i18n-ignore: kept in English in the name saved; shown through similarShown()
    ? `${new Date(ref.runStart).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · ${(ref.distance / 1000).toFixed(1)} km · ${minSec(ref.pace)} /km ±10 %`
    : 'the selection';
  // i18n-ignore: kept in English in the name saved; shown through similarShown()
  return kind === 'route' ? `Same route as ${what}` : `Same profile as ${what}`;
}

/** A name similarName() made, in the language in use (its date and distance in the language's form); null for any other name. */
function similarShown(name: string): string | null {
  const m = /^Same (route|profile) as (.*)$/.exec(name);
  if (!m) return null;
  const [day, km, ...rest] = m[2].split(' · ');
  const at = Date.parse(day);
  const what = m[2] === 'the selection' ? t('the selection')
    : km !== undefined && Number.isFinite(at) ? [dateText(at, { day: 'numeric', month: 'short', year: 'numeric' }), km.replace(/^([\d.]+) km$/, (_, v: string) => `${number(Number(v), 1)} km`), ...rest].join(' · ')
    : m[2];
  return m[1] === 'route' ? t('Same route as {what}', { what }) : t('Same profile as {what}', { what });
}

/** A segment's name as Compare shows it: one the app made (kept in English) in the language in use, one the runner typed as it is. */
export function segmentName(d: Pick<BlockDefinition, 'name' | 'params' | 'tolerances'>): string {
  return similarShown(d.name) ?? shownName(d.name, asRule(d.params, d.tolerances));
}
