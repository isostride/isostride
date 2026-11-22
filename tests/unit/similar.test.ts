import { describe, expect, it } from 'vitest';
import { bestProfileMatch, definitionFromProfile, definitionFromRoute, profileAt, profileOfStretch, profileParts, profileScore, stretchFigures, trackOf } from '@/lib/blocks';
import { detectInstances, similarIn, trackOfStretch } from '@/lib/detection';
import { resample } from '@/lib/geo';
import type { RunFile } from '@/lib/kernel';
import { rowFor, syntheticRun } from '../support/synthetic';

const PACE = (s: number) => 1000 / s;
const M_PER_DEG = 111_195;

/** A run due north from (41.39, lon) at the speed given, its elevation by distance. */
function runNorth(id: string, seconds: number, speedAt: (t: number) => number, { lon = 2.2, alt = () => 50, hr = 140 }: { lon?: number; alt?: (d: number) => number; hr?: number } = {}): RunFile {
  let d = 0;
  const run = syntheticRun(seconds, (t) => {
    const v = speedAt(t);
    const s = { speed: v, heartRate: hr, lat: 41.39 + d / M_PER_DEG, lon, altitude: alt(d) };
    d += v;
    return s;
  });
  return { ...run, id, startTime: `2026-11-${String(10 + id.length).padStart(2, '0')}T07:00:00.000Z` };
}

/** A hill of 20 m over [a, a + 2000) m. */
const hillAt = (a: number) => (d: number) => (d >= a && d < a + 2000 ? 50 + 20 * Math.sin((Math.PI * (d - a)) / 2000) : 50);

describe('Similar stretches', () => {
  it('Profile of a stretch', () => {
    const run = runNorth('a', 1800, () => PACE(300), { alt: hillAt(2000) });
    const tr = trackOf(run);
    const p = profileOfStretch(tr, 600, 1200)!;
    expect(p.distance).toBeCloseTo(2000, -1);
    expect(p.pace).toBeCloseTo(300, 0);
    expect(p.shape.every((x) => Math.abs(x - 1) < 0.05)).toBe(true);
    expect(Math.max(...p.altitude!)).toBeCloseTo(20, 0);
    // Under 400 m: no profile; past the run's end: none either.
    expect(profileOfStretch(tr, 600, 660)).toBeNull();
    expect(profileAt(tr, 5000, 2000)).toBeNull();
    const f = stretchFigures(tr, 2000, 2000)!;
    expect(f.ascent).toBeGreaterThanOrEqual(19);
    expect(f.ascent).toBeLessThanOrEqual(21);
    expect(f.heartRate).toBe(140);
    expect(f.moving).toBeCloseTo(600, -1);
    expect(f.curves.pace).toHaveLength(20);
  });

  it('Profiles scored by terrain, pace shape and level', () => {
    const flat = trackOf(runNorth('a', 1800, () => PACE(300)));
    const key = profileAt(flat, 1000, 2000)!;
    expect(profileScore(profileParts(key, key))).toBeCloseTo(1, 5);
    // A hill costs terrain, intervals the pace's shape, a faster pace its level.
    const hill = profileAt(trackOf(runNorth('b', 1800, () => PACE(300), { alt: hillAt(1000) })), 1000, 2000)!;
    const intervals = profileAt(trackOf(runNorth('c', 1800, (t) => PACE(Math.floor(t / 60) % 2 ? 240 : 360))), 1000, 2000)!;
    const faster = profileAt(trackOf(runNorth('d', 1800, () => PACE(255))), 1000, 2000)!;
    expect(profileParts(key, hill).terrain!).toBeLessThan(0.2);
    expect(profileParts(key, intervals).shape).toBeLessThan(0.5);
    expect(profileParts(key, faster).level).toBeLessThan(0.3);
    expect(profileParts(key, faster).shape).toBeGreaterThan(0.95);
    // Without elevation the score rests on the pace alone.
    expect(profileScore({ terrain: null, shape: 1, level: 0.5 })).toBeCloseTo((0.4 + 0.1) / 0.6, 5);
  });

  it('Same route at another pace, same profile elsewhere', () => {
    const own = runNorth('own', 1800, () => PACE(300), { alt: hillAt(2000) });
    const ref = { track: trackOfStretch(own, 600, 1200), key: profileOfStretch(trackOf(own), 600, 1200) };
    expect(ref.track.length).toBeGreaterThan(150);
    // The same line run a little faster: a pass over the stretch, at its own pace; no profile asked of it.
    const again = similarIn(ref, runNorth('again', 1800, () => PACE(285), { alt: hillAt(2000) }), 'Tempo');
    expect(again.route).toHaveLength(1);
    expect(again.route[0].pace).toBeCloseTo(285, -1);
    // The same line run easy, 20 % slower: no like effort ("mnostwo biegow np po 5:23" for one at 4:12).
    expect(similarIn(ref, runNorth('easy', 2400, () => PACE(360), { alt: hillAt(2000) }), null).route).toHaveLength(0);
    expect(again.route[0].title).toBe('Tempo');
    expect(again.profile).toBeNull();
    // 8 km east, the hill a kilometre earlier: no pass, its stretch of the same profile found at the hill.
    const elsewhere = similarIn(ref, runNorth('elsewhere', 1800, () => PACE(300), { lon: 2.3, alt: hillAt(1000) }), null);
    expect(elsewhere.route).toHaveLength(0);
    expect(elsewhere.profile!.from).toBeGreaterThan(280);
    expect(elsewhere.profile!.from).toBeLessThan(320);
    expect(elsewhere.profile!.score).toBeGreaterThan(0.9);
    // Flat and at intervals: not alike enough.
    expect(similarIn(ref, runNorth('flat', 1800, (t) => PACE(Math.floor(t / 60) % 2 ? 240 : 360), { lon: 2.3 }), null).profile).toBeNull();
  });

  it('Same route and same profile kept as blocks', () => {
    const own = runNorth('own', 1800, () => PACE(300), { alt: hillAt(2000) });
    const route = definitionFromRoute(trackOfStretch(own, 600, 1200));
    expect(route.name).toMatch(/^2\.0 km north-bound, any pace$/);
    const fast = runNorth('fast', 1800, () => PACE(250), { alt: hillAt(2000) });
    const pts = resample(fast.samples.lat, fast.samples.lon, fast.samples.t, 10);
    // At any pace: the faster pass is kept, the general conditions off.
    const passes = detectInstances(route, fast, rowFor(fast), pts);
    expect(passes).toHaveLength(1);
    expect(passes[0].status).toBe('accepted');
    // With the reference's pace: only passes within 10 % of it.
    const atPace = definitionFromRoute(trackOfStretch(own, 600, 1200), 300);
    expect(atPace.name).toBe('2.0 km north-bound, pace 4:30–5:30');
    expect(detectInstances(atPace, fast, rowFor(fast), pts)).toHaveLength(0);
    const slower = runNorth('slower', 1800, () => PACE(310), { alt: hillAt(2000) });
    expect(detectInstances(atPace, slower, rowFor(slower), resample(slower.samples.lat, slower.samples.lon, slower.samples.t, 10))).toHaveLength(1);
    const profile = definitionFromProfile(profileOfStretch(trackOf(own), 600, 1200)!);
    expect(profile.name).toMatch(/^Like 2\.0 km, 20 m up, pace 5:00$/);
    const elsewhere = runNorth('elsewhere', 1800, () => PACE(300), { lon: 2.3, alt: hillAt(1000) });
    const found = detectInstances(profile, elsewhere, rowFor(elsewhere), []);
    expect(found).toHaveLength(1);
    expect(found[0].start).toBeGreaterThan(280);
    expect(found[0].start).toBeLessThan(320);
    // A rule with a profile as its stretch, as the one model keeps it; a run shorter than it has no match.
    if (profile.params.type !== 'rule' || profile.params.shape.type !== 'profile') throw new Error('not a profile rule');
    expect(bestProfileMatch(profile.params.shape.key, trackOf(runNorth('x', 300, () => PACE(300))))).toBeNull();
  });

  it('Profile of a run with pauses, gaps and no elevation', () => {
    // 5:00 /km with no elevation; a 40 s pause (no samples) at 10 minutes; samples without distance; a distance that steps back.
    const run = runNorth('p', 1800, () => PACE(300), { alt: () => null as unknown as number });
    const keep = run.samples.t.map((t) => t < 600 || t >= 640);
    for (const k of Object.keys(run.samples) as (keyof typeof run.samples)[]) (run.samples[k] as unknown[]) = (run.samples[k] as unknown[]).filter((_, i) => keep[i]);
    // Auto-paused while standing: the distance does not move over the pause.
    const after = run.samples.t.findIndex((t) => t >= 640);
    const jump = run.samples.distance[after]! - run.samples.distance[after - 1]! - PACE(300);
    for (let i = after; i < run.samples.distance.length; i++) run.samples.distance[i]! -= jump;
    run.samples.distance[5] = null;
    run.samples.distance[10] = run.samples.distance[9]! - 5;
    const tr = trackOf(run);
    expect(tr.d.length).toBe(run.samples.t.length - 2);
    // The pause is no moving time: the pace stays 5:00 over it.
    const p = profileOfStretch(tr, 300, 1200)!;
    expect(p.pace).toBeCloseTo(300, -1);
    expect(p.altitude).toBeNull();
    expect(stretchFigures(tr, 1000, 2000)!.ascent).toBeNull();
    // An empty run has no profile.
    const none = trackOf(syntheticRun(10, () => ({})));
    expect(profileOfStretch(none, 0, 10)).toBeNull();
    expect(profileAt(none, 0, 500)).toBeNull();
  });
});
