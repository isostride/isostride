import { ALGORITHM_VERSION } from '@/lib/kernel';

// Apart from summary.ts, which reads run files: what opens with every screen (the look at the folder as
// the app opens) asks only whether the summaries are current, and must not carry the summarising with it
// (the script of every route grew by 1.5 KB, the Run screen past its budget).

/** Raised when the summary changes, so every run is summarised again (3: where each best lies and the heart rate in it; 4: the bests of every length of the curve, 30 s to 2 h; 5: the curve fitted as an envelope moves the critical speed and power, so the loads of rTSS and Power TSS are counted again; 6: the bests taken whole and from the effort pace or without downhills, the heart rate's peak from a 10 s window, the efficiency from the effort pace, the steady part past the warm-up; 7: the decoupling past the warm-up). */
export const LOAD_SUMMARY_VERSION = 7;

/**
 * Whether the summaries kept (derived/load-summaries.json) were made by this version of the summary and of
 * the algorithms: else they are made again (lib/context), and the screens that read them wait for that.
 */
export function summariesCurrent(file: { version?: number; algorithmVersion?: number } | null | undefined): boolean {
  return !!file && file.version === LOAD_SUMMARY_VERSION && file.algorithmVersion === ALGORITHM_VERSION;
}
