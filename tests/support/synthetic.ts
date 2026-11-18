import type { IndexedRun, RunFile } from '@/lib/ingest/importFolder';
import type { Samples, Series } from '@/lib/ingest/parseFit';
import { buildWindows } from '@/lib/prepare/windows';
import { DEFAULT_TOLERANCES, type BlockDefinition, type Tolerances } from '@/lib/blocks/types';

type Sample = Partial<Record<Exclude<keyof Samples, 't'>, number | null>>;

/** A synthetic run file of `seconds` 1 s samples; distance integrates speed. */
export function syntheticRun(seconds: number, f: (t: number) => Sample, laps: RunFile['laps'] = []): RunFile {
  const s = {
    t: [], speed: [], heartRate: [], cadence: [], groundContactTime: [], verticalOscillation: [], stepLength: [],
    power: [], altitude: [], lat: [], lon: [], temperature: [], effortPace: [], legSpringStiffness: [], distance: [],
  } as unknown as Samples;
  let dist = 0;
  for (let t = 0; t < seconds; t++) {
    const v = f(t);
    s.t.push(t);
    const speed = v.speed ?? null;
    for (const k of Object.keys(s) as (keyof Samples)[]) {
      if (k === 't' || k === 'distance') continue;
      (s[k] as Series).push(v[k] ?? (k === 'effortPace' ? speed : null));
    }
    s.distance.push(dist);
    dist += speed ?? 0;
  }
  return {
    schemaVersion: 1, algorithmVersion: 1, id: 'synthetic', startTime: '2026-11-14T07:00:00.000Z', file: 'fit/synthetic.fit',
    device: 'COROS PACE 4', distance: dist, duration: seconds, elapsed: seconds, temperature: 12,
    sources: {}, laps, samples: s, windows: buildWindows(s),
  };
}

export function rowFor(run: RunFile, extra: Partial<IndexedRun> = {}): IndexedRun {
  return {
    id: run.id, startTime: run.startTime, file: run.file, device: run.device, distance: run.distance, duration: run.duration,
    avgSpeed: run.distance / run.duration, avgHeartRate: null, temperature: run.temperature, hasGps: false, laps: run.laps.length,
    algorithmVersion: 1, shoes: 'Shoes A', heartRateSource: 'Arm band', workoutType: 'long', techniqueCue: null, load3: 120, load7: 300,
    ...extra,
  };
}

export function steadyDef(tol: Partial<Tolerances> = {}): BlockDefinition {
  return {
    id: 'steady', name: 'Steady 4:45–5:15', origin: 'manual', status: 'active', createdAt: '2026-11-18T00:00:00Z',
    params: { type: 'steady', minDuration: 60 },
    tolerances: { ...DEFAULT_TOLERANCES, paceMin: 285, paceMax: 315, ...tol },
  };
}
