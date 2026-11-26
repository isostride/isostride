/**
 * The balance of the reserve above the critical speed (D′) or power (W′) through a run (requirement
 * "D′ balance of a run"), by Skiba's differential model (Skiba et al. 2015): above the critical rate the
 * reserve is spent by the rate above it; below it, it comes back as (reserve − balance) · (critical −
 * rate) / reserve a second, taken exactly over each step: reserve − (reserve − balance) · e^(−(critical
 * − rate)·dt / reserve).
 */

/** A sample's rate is held until the next one, but no longer than this, s: a pause counts as standing (rate 0). */
const HOLD = 5;

export interface Balance {
  /** the time of each sample, s, and the balance after it, as a share of the reserve (1 full, under 0 spent past it) */
  t: number[];
  share: number[];
  /** the lowest share and when it was reached; null without samples */
  low: { t: number; share: number } | null;
}

/** The balance through a run of `rate` (speed m/s or power W, by sample at times `t`) against a critical rate and its reserve (m or J). */
export function reserveBalance(t: number[], rate: (number | null)[], critical: number, reserve: number): Balance {
  const share: number[] = [];
  let balance = reserve;
  let low: Balance['low'] = null;
  for (let i = 0; i < t.length; i++) {
    if (i > 0) {
      const dt = Math.min(t[i] - t[i - 1], HOLD);
      const r = Math.max(0, rate[i - 1] ?? 0);
      // Standing past the hold: the rest of the gap at rate 0, the reserve coming back.
      const rest = Math.max(0, t[i] - t[i - 1] - HOLD);
      if (r > critical) balance -= (r - critical) * dt;
      else balance = reserve - (reserve - balance) * Math.exp((-(critical - r) * dt) / reserve);
      if (rest > 0) balance = reserve - (reserve - balance) * Math.exp((-critical * rest) / reserve);
    }
    const s = balance / reserve;
    share.push(s);
    if (!low || s < low.share) low = { t: t[i], share: s };
  }
  return { t: [...t], share, low };
}
