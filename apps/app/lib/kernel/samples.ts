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
/** A run with more than this share of its gaps over a second was recorded smart (a watch recording every second leaves such a gap at a pause or a lost sample: a few in a thousand). */
const SMART_SHARE = 0.1;
const GAPS = new WeakMap<number[], number>();

/**
 * The gap between two samples, s, past which the watch was paused, for a run's sample times: 2 s for a
 * watch that records every second, MAX_SAMPLE_COVER for one that records smart (its samples lie 1 to 7 s
 * apart, and every gap over 2 s read as a pause left its segments with no moving sample at all). By the
 * share of the run's gaps over a second: by their median, a run with just under half its gaps of 3 to 6 s
 * was one recorded every second, and all of it stopped (the review of 26 Nov 2026).
 */
export function pauseGap(t: number[]): number {
  const known = GAPS.get(t);
  if (known !== undefined) return known;
  let over = 0;
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 1) over++;
  const gap = over > SMART_SHARE * (t.length - 1) ? MAX_SAMPLE_COVER : SECOND_BY_SECOND_GAP;
  GAPS.set(t, gap);
  return gap;
}

/** Whether the run was recorded smart (pauseGap): its samples then stand for unequal times. */
export const recordedSmart = (t: number[]): boolean => pauseGap(t) !== SECOND_BY_SECOND_GAP;

/**
 * The longest gap between two samples that still counts as running, s, where 5 s was the rule before a
 * watch's way of recording was looked at (a stretch's moving time, the work of power, the normalised
 * pace): 5 s for a watch recording every second, MAX_SAMPLE_COVER for one recording smart, whose gaps of
 * 6 and 7 s were left out as pauses (an hour at 5:00/km read 2:41/km).
 */
export const runningGap = (t: number[]): number => Math.max(5, pauseGap(t));

/**
 * The time a sample stands for, s: a second in a run recorded every second (as its samples were
 * counted before); in one recorded smart, the time to the next sample, MAX_SAMPLE_COVER at most.
 */
export function sampleHold(t: number[], i: number): number {
  if (pauseGap(t) === SECOND_BY_SECOND_GAP || i + 1 >= t.length) return 1;
  return Math.min(Math.max(t[i + 1] - t[i], 0), MAX_SAMPLE_COVER);
}
