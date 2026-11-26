import { FitWriter, type FitMessages } from './fit';
import type { Part, PartKind, PlannedRun } from './plan';
import { rng, wander } from './random';
import { courseOf, toLatLon } from './routes';
import { HR_MAX, HR_REST, RESERVE_AT_CS, STORY_WEEKS } from './runner';

/** The watch of the demo runner, as its files name it. */
export const DEMO_WATCH = 'Demo Watch';
const SEMICIRCLES = 2 ** 31 / 180;

/** How the pace goes inside a part, by how far through it the runner is (0 to 1). */
const SHAPE: Record<PartKind, (f: number) => number> = {
  // A repetition: off too fast, settling, a push at the end.
  rep: (f) => 1 + 0.04 * Math.exp(-f / 0.07) - 0.01 + 0.025 * Math.max(0, (f - 0.82) / 0.18),
  // A race: a fast start, a flat middle that sags a little, a kick; its mean is 1, so the time is the model's.
  race: (f) => (1 + 0.05 * Math.exp(-f / 0.05) - 0.012 - 0.01 * Math.sin(Math.PI * f) + 0.05 * Math.max(0, (f - 0.9) / 0.1)) / 0.9866,
  // Steady running: into it over the first part, a touch faster towards the end.
  steady: (f) => 0.985 + 0.03 * f,
  easy: () => 1,
  jog: () => 1,
  stride: () => 1,
  float: () => 1,
};

/** What the shoes do to the ground contact time, ms: the faster pairs shorten it. */
const CONTACT: Record<string, number> = { 'g-tempo-1': -4, 'g-tempo-2': -5, 'g-tempo-3': -12, 'g-race': -15 };

/** The air on a day of the year at an hour, °C: a cold January, a mild July, cooler in the morning. */
function temperatureOn(start: Date): number {
  const dayOfYear = (start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / 86_400_000;
  return 9.5 - 10 * Math.cos((2 * Math.PI * (dayOfYear - 20)) / 365) + (start.getHours() < 10 ? -2.5 : 2);
}

export interface DemoRun {
  /** the FIT file */
  fit: Uint8Array;
  /** the file's messages as its decoder gives them */
  messages: FitMessages;
}

/**
 * A planned run as a watch records it, second by second: the pace wanders and is never held exactly, a
 * repetition starts too fast and ends with a push, a recovery starts with a walk, an easy run starts
 * slowly and may stop on the way; the heart rate lags (faster up than down) and drifts with the work
 * done and the heat; cadence, ground contact and oscillation follow the speed with their own scatter,
 * the shoes and tiredness; the position scatters by a couple of metres.
 */
export function generateRun(run: PlannedRun): DemoRun {
  const r = rng(run.seed);
  const cs = run.cs;
  const racing = run.parts.some((p) => p.kind === 'race');
  // The day: a good one or a flat one; a race is run to form.
  const form = racing ? 1 : 1 + r.gauss() * 0.012;
  const course = run.legs ? courseOf(run.legs) : null;
  const indoor = !course;
  const temp = Math.round(Math.min(34, Math.max(-12, indoor ? 20 + r.gauss() : temperatureOn(run.start) + run.warmer + r.gauss() * 3)));
  const heat = Math.max(0, temp - 18) * 0.0025;
  // On a treadmill the belt holds the pace; in a race the runner does.
  const steadier = indoor ? 0.3 : racing ? 0.15 : 1;
  const slow = wander(r, 150, 0.016 * steadier); const mid = wander(r, 18, 0.011 * steadier); const gps = wander(r, 3, indoor ? 0.004 : 0.012);
  const hrW = wander(r, 9, run.strap ? 1.1 : 2.4); const cadW = wander(r, 25, 1.3); const gctW = wander(r, 30, 3.2); const voW = wander(r, 30, 2.2);
  const px = wander(r, 40, 1.6); const py = wander(r, 40, 1.6); const altW = wander(r, 120, 0.5);
  const hrDay = r.gauss() * 0.7; const hrSlow = wander(r, 120, run.strap ? 1.8 : 2.6);
  // Running economy: a little better or worse on the day, 3 % better by the end of the story (so power gains less than speed).
  const economy = (1 + r.gauss() * 0.003) * (1 - 0.03 * Math.min(1, Math.max(0, run.week / (STORY_WEEKS - 1))));
  const contact = (run.shoes ? CONTACT[run.shoes] ?? 0 : 0) - (run.cue ? 4 : 0);
  const quicker = run.cue ? 4 : 0;

  const planned = (p: Part) => p.metres ?? p.seconds! * p.share * cs;
  const total = run.parts.reduce((a, p) => a + planned(p), 0);
  const halts = Array.from({ length: run.stops }, () => ({ at: total * (0.15 + 0.7 * r.next()), left: Math.round(8 + r.next() * 22) }));
  const fit = new FitWriter(run.start, DEMO_WATCH, Math.round(run.estimate * 1.1));

  let t = 0; let dist = 0; let v = 0; let hr = 78 + r.gauss() * 5; let drift = 0; let tired = 0;
  let lapT = 0; let lapD = 0;
  const closeLap = () => { if (t > lapT) fit.lap(lapT, t, dist - lapD); lapT = t; lapD = dist; };
  /** where the part before ended as planned, when it was counted in metres: the next one counts on from there, so the parts stay on their legs of the way */
  let mark: number | null = null;
  run.parts.forEach((p, index) => {
    const kind = p.kind;
    const rep = kind === 'rep' ? 1 + r.gauss() * 0.014 : 1;
    // A stride, a short repetition and a race are started hard.
    const quick = kind === 'stride' || kind === 'race' || (kind === 'rep' && (p.metres ?? Infinity) <= 400);
    // The first seconds of a recovery: a walk.
    const walk = kind === 'jog' ? Math.round(p.metres ? 8 + r.next() * 7 : 12 + r.next() * 16) : 0;
    const d0 = dist; const t0 = t;
    const last = index === run.parts.length - 1;
    const end = p.metres !== undefined ? (mark ?? dist) + p.metres : null;
    // A run that ends where it began: its last part goes on to the distance planned (within reason), not to its minute.
    const going = () => (end !== null ? dist < end : last && run.home ? (dist < total && t - t0 < p.seconds! * 1.6) || t - t0 < p.seconds! * 0.5 : t - t0 < p.seconds!);
    const length = p.metres ?? p.seconds!;
    while (going()) {
      const f = Math.min(1, (p.metres ? dist - d0 : t - t0) / length);
      const halt = halts.find((h) => h.left > 0 && dist >= h.at);
      if (halt) halt.left--;
      const alt = course ? course.alt(dist) : 0;
      const grade = course ? (course.alt(dist + 5) - alt) / 5 : 0;
      let target = p.share * cs * form * rep * SHAPE[kind](f) * (1 + slow.step() + mid.step()) * (1 - 2.2 * grade);
      // Into the run slowly.
      if (index === 0 && kind === 'easy') target *= 0.93 + 0.07 * Math.min(1, (dist - d0) / 900);
      if (t - t0 < walk) target = 1.6 + 0.3 * r.next();
      if (halt) target = 0;
      // The legs follow the aim in a few seconds, slower when speeding up than when easing off; into a sprint at once.
      v += (target - v) / (target > v ? (quick ? 2 : 4) : 2.5);
      if (v < 0.05) v = 0;
      const moving = v > 0.6;
      // The heart: demand by the speed against the critical speed, the slope, the heat and the drift of the work done.
      drift += ((v / cs) ** 3 * 0.035) / 3600;
      const demand = Math.min(1, Math.max(0.22, RESERVE_AT_CS * (v / cs) * (1 + 3 * grade) * (1 + drift + heat)));
      const steady = HR_REST + (HR_MAX - HR_REST) * demand + hrDay;
      // From the wrist the heart rate follows later than from a strap.
      hr += (steady + hrSlow.step() - hr) / (steady > hr ? (run.strap ? 34 : 44) : run.strap ? 60 : 70);
      tired += v > 0.95 * cs ? 1 : 0;
      // Through a hard effort the stride quickens and the contact lengthens.
      const hard = kind === 'rep' || kind === 'race' ? f : 0;
      const spm = moving ? Math.round(Math.min(198, 164 + 13 * (v - 3.5) + 1.5 * hard + quicker + cadW.step())) : 0;
      const vo = 92 - 6 * (v - 3.5) - (run.cue ? 3 : 0) + voW.step() + r.gauss() * 1.2;
      const step = moving ? (v * 60 * 1000) / spm : 0;
      let lat: number | null = null; let lon: number | null = null;
      if (course) {
        const [x, y] = course.at(dist);
        const [la, lo] = toLatLon(course.place, x + px.step(), y + py.step());
        lat = Math.round(la * SEMICIRCLES); lon = Math.round(lo * SEMICIRCLES);
      }
      fit.record({
        t,
        lat,
        lon,
        distance: Math.round(dist * 100),
        speed: Math.round(Math.max(0, v * (1 + gps.step())) * 1000),
        heartRate: Math.round(Math.min(HR_MAX + 2, hr + hrW.step())),
        altitude: course ? Math.round((alt + altW.step() + 500) * 5) : null,
        temperature: temp,
        stride: moving ? {
          cadence: Math.floor(spm / 2),
          fraction: spm % 2 ? 64 : 0,
          // Ground contact: shorter the faster and in the faster shoes, longer as the hard running adds up.
          stance: Math.round(250 - 32 * (v - 3.5) + contact + tired * 0.004 + 3 * hard + gctW.step() + r.gauss() * 2) * 10,
          oscillation: Math.round(vo * 10),
          ratio: Math.round((vo / step) * 10000),
          step: Math.round(step) * 10,
          power: Math.max(0, Math.round(63 * v * economy * (1 + 9 * grade) + (target - v) * 14 + r.gauss() * 6)),
        } : null,
      });
      dist += v; t++;
      if (run.autoLap && dist - lapD >= 1000) closeLap();
    }
    mark = end;
    if (p.lap) closeLap();
  });
  closeLap();
  return fit.finish(t, dist, temp, indoor);
}
