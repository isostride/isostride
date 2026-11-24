/**
 * The steps of the setup, the data folder first (the runner's "uruchomilem w incognito i dalej pyta o
 * folder": choosing the folder is the wizard's first step, on the Welcome screen, for a page may read
 * a folder only once the runner picks it). `at` is the step shown, counted from the data folder (0).
 */
/**
 * Set when the runner picks a folder on the Welcome screen, the setup's first step ("wizard przerywa
 * po podaniu katalogu z plikami"): the wizard goes on to its next step whatever the folder holds.
 */
import { msg, number, t } from '@/lib/i18n';

export const SETUP_CONTINUE = 'strideprism.setupContinue';

/** The steps' names, in English (they name the steps for the tests too); shown in the language in use. */
export const SETUP_STEPS = [msg('Data folder'), msg('Your runs'), msg('You'), msg('Zones'), msg('Gear'), msg('Load model'), msg('Display'), msg('Done')] as const;

/** Compact: a bar of segments, only the current step's name shown (the names stay for screen readers). */
export function SetupSteps({ at, compact = false }: { at: number; compact?: boolean }) {
  return (
    <ol className={`setup-steps${compact ? ' compact' : ''}`} aria-label={t('Steps')}>
      {SETUP_STEPS.map((s, i) => (
        <li key={s} className={i === at ? 'on' : i < at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}>
          <span className="setup-num">{i < at ? '✓' : number(i + 1)}</span>{t(s)}
        </li>
      ))}
    </ol>
  );
}
