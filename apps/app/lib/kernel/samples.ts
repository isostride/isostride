/**
 * How a run's samples stand for time, shared by the windows (prepare) and the segments (detection): the
 * two disagreed, and a watch that records smart lost every segment (the review of 26 Nov 2026).
 */

/**
 * A sample stands for the time to the next one, but no more than this, s (requirement "Stops found by
 * time"): a watch that records smart (every 1 to 7 s) covers its 10 s windows, a pause without samples
 * does not.
 */
export const MAX_SAMPLE_COVER = 10;

/** The gap between samples, s, past which a watch that records every second was paused. */
const SECOND_BY_SECOND_GAP = 2;
const GAPS = new WeakMap<number[], number>();

/**
 * The gap between two samples, s, past which the watch was paused, for a run's sample times: 2 s for a
 * watch that records every second, MAX_SAMPLE_COVER for one that records smart (its samples lie 1 to 7 s
 * apart, and every gap over 2 s read as a pause left its segments with no moving sample at all). By the
 * median gap of the run.
 */
export function pauseGap(t: number[]): number {
  const known = GAPS.get(t);
  if (known !== undefined) return known;
  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1]);
  gaps.sort((a, b) => a - b);
  const gap = (gaps[gaps.length >> 1] ?? 1) <= 1 ? SECOND_BY_SECOND_GAP : MAX_SAMPLE_COVER;
  GAPS.set(t, gap);
  return gap;
}

/** Whether the run was recorded smart (pauseGap): its samples then stand for unequal times. */
export const recordedSmart = (t: number[]): boolean => pauseGap(t) !== SECOND_BY_SECOND_GAP;

/**
 * The time a sample stands for, s: a second in a run recorded every second (as its samples were
 * counted before); in one recorded smart, the time to the next sample, MAX_SAMPLE_COVER at most.
 */
export function sampleHold(t: number[], i: number): number {
  if (pauseGap(t) === SECOND_BY_SECOND_GAP || i + 1 >= t.length) return 1;
  return Math.min(Math.max(t[i + 1] - t[i], 0), MAX_SAMPLE_COVER);
}
