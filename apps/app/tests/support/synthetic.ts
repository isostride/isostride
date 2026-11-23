import { KNOWN_METRICS, type IndexedRun, type RunFile, type Samples, type Series } from '@/lib/kernel';
import { buildWindows } from '@/lib/prepare';
import { DEFAULT_TOLERANCES, asRule, type BlockDefinition, type Tolerances } from '@/lib/blocks';

/** One sample: lat, lon and any metric by its key (distance integrates speed). */
type Sample = Partial<Record<string, number | null>>;

/** The metrics of a synthetic run: those of a COROS run (effort pace following the speed when not given). */
const METRICS = ['speed', 'heartRate', 'cadence', 'groundContactTime', 'verticalOscillation', 'stepLength', 'power', 'altitude', 'temperature', 'effortPace', 'legSpringStiffness'];

/** A synthetic run file of `seconds` 1 s samples; distance integrates speed. */
export function syntheticRun(seconds: number, f: (t: number) => Sample, laps: RunFile['laps'] = []): RunFile {
  const values: Record<string, Series> = {};
  const s: Samples = { t: [], distance: [], lat: [], lon: [], values };
  let dist = 0;
  for (let t = 0; t < seconds; t++) {
    const v = f(t);
    s.t.push(t);
    const speed = v.speed ?? null;
    s.lat.push(v.lat ?? null);
    s.lon.push(v.lon ?? null);
    const keys = new Set([...METRICS, ...Object.keys(v).filter((k) => k !== 'lat' && k !== 'lon')]);
    for (const k of keys) (values[k] ??= new Array<number | null>(t).fill(null)).push(v[k] ?? (k === 'effortPace' ? speed : null));
    s.distance.push(dist);
    dist += speed ?? 0;
  }
  return {
    schemaVersion: 1, algorithmVersion: 1, id: 'synthetic', startTime: '2026-11-14T07:00:00.000Z', file: 'fit/synthetic.fit',
    device: 'COROS PACE 4', distance: dist, duration: seconds, elapsed: seconds, temperature: 12,
    sources: {}, laps, samples: s, windows: buildWindows(s),
    metrics: Object.keys(values).map((k) => KNOWN_METRICS[k] ?? { key: k, name: k, short: k, unit: '', origin: 'standard', direction: 'neutral', display: 'value', decimals: 1, minSpan: 0 }),
  };
}

export function rowFor(run: RunFile, extra: Partial<IndexedRun> = {}): IndexedRun {
  return {
    id: run.id, startTime: run.startTime, file: run.file, device: run.device, distance: run.distance, duration: run.duration,
    avgSpeed: run.distance / run.duration, avgHeartRate: null, temperature: run.temperature, hasGps: false, laps: run.laps.length,
    metrics: run.metrics.map((m) => m.key), algorithmVersion: 1, shoes: 'Shoes A', heartRateSource: 'Arm band', workoutType: 'long', techniqueCue: null, load3: 120, load7: 300,
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

/** The stretch a block or a suggestion takes, in the one model (a stored older kind read as its rule). */
export function shapeOf(d: { params: import('@/lib/blocks').BlockParams; tolerances: Tolerances }) {
  return asRule(d.params, d.tolerances).shape;
}
