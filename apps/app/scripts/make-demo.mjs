// A demo data folder: 24 weeks of training of a made-up runner whose critical speed comes up to about
// 3:15 /km (the runner's "przygotuj fakeowe dane ... biegacz z tempem krytycznym ok 3:15"), as FIT files
// recorded as a watch records (uneven pace, a lagging heart rate, scatter, stops, a week off sick),
// with the folder's user files (gear, tags, settings, segments, dashboard). Nobody's real data: the
// site's screenshots are taken from it. The same numbers on every run of the script (a seeded generator).
//
//   node scripts/make-demo.mjs <folder> [last day, YYYY-MM-DD; today by default]
import fs from 'node:fs';
import path from 'node:path';
import { Encoder, Profile } from '@garmin/fitsdk';

const OUT = process.argv[2];
if (!OUT) throw new Error('usage: node scripts/make-demo.mjs <folder> [YYYY-MM-DD]');
const END = new Date(`${process.argv[3] ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const WEEKS = 24;
const DAY = 86_400_000;
const DEG = 2 ** 31 / 180;

/**
 * The runner: critical speed from 3:21 to 3:15 /km over the weeks, D′ 230 m, heart rate 44 to 190. The races
 * are run to that model exactly (no good or flat day), so the app's fit to the bests comes to about 3:15.
 */
const CS_FROM = 1000 / 201;
const CS_TO = 1000 / 195;
const D_PRIME = 230;
const HR_REST = 44;
const HR_MAX = 190;
/** The day the shoes change: the newer ones shorten the ground contact by 7 ms. */
const SHOES_CHANGE = new Date(END.getTime() - 10 * 7 * DAY);

let seed = 20261123;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const noise = (a) => (rnd() - 0.5) * 2 * a;
/** A normal deviate (Box and Muller). */
const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
/** A wandering value: back to 0 with the time constant tau (s), sd its spread; step() once a second. */
const wander = (tau, sd) => { let x = gauss() * sd; return { step() { x += -x / tau + sd * Math.sqrt(2 / tau) * gauss(); return x; } }; };

// A park in the middle of a made-up town: metres east and north of this point.
const LAT0 = 52.4735;
const LON0 = 13.4015;
const toLatLon = (x, y) => [LAT0 + y / 111_320, LON0 + x / (111_320 * Math.cos((LAT0 * Math.PI) / 180))];

/** A stadium-shaped loop by arc length: two straights and two half circles, turned by `turn` rad. */
function stadium(straight, radius, turn, ox = 0, oy = 0) {
  const length = 2 * straight + 2 * Math.PI * radius;
  return {
    length,
    at(d) {
      let s = ((d % length) + length) % length;
      let x; let y;
      if (s < straight) { x = s - straight / 2; y = -radius; }
      else if (s < straight + Math.PI * radius) { const a = (s - straight) / radius - Math.PI / 2; x = straight / 2 + radius * Math.cos(a); y = radius * Math.sin(a); }
      else if (s < 2 * straight + Math.PI * radius) { s -= straight + Math.PI * radius; x = straight / 2 - s; y = radius; }
      else { const a = (s - 2 * straight - Math.PI * radius) / radius + Math.PI / 2; x = -straight / 2 + radius * Math.cos(a); y = radius * Math.sin(a); }
      const c = Math.cos(turn); const sn = Math.sin(turn);
      return [ox + x * c - y * sn, oy + x * sn + y * c];
    },
  };
}
const ROUTES = {
  /** the park's loop, 6.0 km, a rise of 9 m on its far side */
  loop: { ...stadium(1500, 477, 0.5), alt: (d) => 46 + 4.5 * (1 - Math.cos((2 * Math.PI * d) / 5997)) },
  /** the 400 m track beside it */
  track: { ...stadium(84.39, 36.5, 0.2, -900, 700), alt: () => 47 },
};

const csOn = (day) => CS_FROM + (CS_TO - CS_FROM) * Math.min(1, (day / (WEEKS * 7 - 1)) ** 0.8);

/** How the pace goes inside a part, by how far through it the runner is (0 to 1). */
const SHAPE = {
  // A repetition: off too fast, settling, a push at the end.
  rep: (f) => 1 + 0.04 * Math.exp(-f / 0.07) - 0.01 + 0.025 * Math.max(0, (f - 0.82) / 0.18),
  // A race: a fast start, a flat middle that sags a little, a kick.
  race: (f) => (1 + 0.05 * Math.exp(-f / 0.05) - 0.012 - 0.01 * Math.sin(Math.PI * f) + 0.05 * Math.max(0, (f - 0.9) / 0.1)) / 0.9866, // its mean 1: the time is the model's
  // Steady running: into it over the first part, a touch faster towards the end.
  steady: (f) => 0.985 + 0.03 * f,
  easy: () => 1,
  jog: () => 1,
};

/**
 * Writes one run, second by second, as a watch would record it: the pace wanders and is never held
 * exactly, a repetition starts too fast and ends with a push, a recovery starts with a walk, an easy
 * run starts slowly and may stop at a crossing; the heart rate lags (faster up than down) and drifts
 * with the work done; cadence, ground contact and oscillation follow the speed with their own scatter
 * and with tiredness; the position scatters by a couple of metres.
 * Parts: { seconds or metres, share of the critical speed, kind, lap }.
 */
function writeRun({ start, day, route, parts, autoLap = false, stops = 0 }) {
  const cs = csOn(day);
  const form = parts.some((p) => p.kind === 'race') ? 1 : 1 + gauss() * 0.012; // the day: a good one or a flat one; a race is run to form
  const r = ROUTES[route];
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'development', product: 1, timeCreated: start, serialNumber: 4242 });
  enc.onMesg(Profile.MesgNum.DEVICE_INFO, { timestamp: start, deviceIndex: 'creator', productName: 'Demo Watch' });
  const newShoes = start >= SHOES_CHANGE;
  const temp = Math.round(21 - (15 * day) / (WEEKS * 7) + gauss() * 2.5);
  const heat = Math.max(0, temp - 18) * 0.004;
  const slow = wander(150, 0.016); const mid = wander(18, 0.011); const gps = wander(3, 0.012);
  const hrW = wander(9, 1.1); const cadW = wander(25, 1.3); const gctW = wander(30, 3.2); const voW = wander(30, 2.2);
  const px = wander(40, 1.6); const py = wander(40, 1.6); const altW = wander(120, 0.5);
  const hrDay = gauss() * 1.5; const hrSlow = wander(120, 1.8);
  // Running economy: a little better or worse on the day, 2 % better by the end of the weeks (so power gains less than speed).
  const economy = (1 + gauss() * 0.015) * (1 - (0.02 * day) / (WEEKS * 7));
  let t = 0; let dist = 0; let v = 0; let hr = 78 + gauss() * 5; let drift = 0; let tired = 0;
  const laps = [];
  let lapT = 0; let lapD = 0;
  const closeLap = () => { if (t > lapT) laps.push({ timestamp: new Date(start.getTime() + t * 1000), startTime: new Date(start.getTime() + lapT * 1000), totalElapsedTime: t - lapT, totalTimerTime: t - lapT, totalDistance: Math.round((dist - lapD) * 100) / 100, sport: 'running' }); lapT = t; lapD = dist; };
  // Stops at a crossing: at these distances, for these seconds.
  const total = parts.reduce((a, p) => a + (p.metres ?? p.seconds * p.share * cs), 0);
  const halts = Array.from({ length: stops }, () => ({ at: total * (0.15 + 0.7 * rnd()), left: Math.round(8 + rnd() * 22) }));
  for (const p of parts) {
    const rep = p.kind === 'rep' ? 1 + gauss() * 0.014 : 1;
    const walk = p.kind === 'jog' ? Math.round(12 + rnd() * 16) : 0; // the first seconds of a recovery: a walk
    const d0 = dist; const t0 = t;
    const length = p.metres ?? p.seconds;
    while (p.metres ? dist - d0 < p.metres : t - t0 < p.seconds) {
      const f = Math.min(1, (p.metres ? dist - d0 : t - t0) / length);
      const halt = halts.find((h) => h.left > 0 && dist >= h.at);
      if (halt) halt.left--;
      const alt = r.alt(dist);
      const grade = (r.alt(dist + 5) - alt) / 5;
      let target = p.share * cs * form * rep * (SHAPE[p.kind ?? 'easy'](f)) * (1 + slow.step() + mid.step()) * (1 - 2.2 * grade);
      if (p.kind === 'easy' || p.kind === undefined) target *= 0.93 + 0.07 * Math.min(1, (dist - d0) / 900); // into the run slowly
      if (t - t0 < walk) target = 1.6 + 0.3 * rnd();
      if (halt) target = 0;
      // The legs follow the aim in a few seconds, slower when speeding up than when easing off.
      v += (target - v) / (target > v ? 4 : 2.5);
      if (v < 0.05) v = 0;
      const moving = v > 0.6;
      // The heart: demand by the speed against the critical speed, the heat and the drift of the work done.
      drift += ((v / cs) ** 3 * 0.035) / 3600;
      const demand = Math.min(1.0, Math.max(0.22, (-0.05 + 0.93 * (v / cs) * (1 + 3 * grade)) * (1 + drift + heat)));
      const steady = HR_REST + (HR_MAX - HR_REST) * demand + hrDay;
      hr += (steady + hrSlow.step() - hr) / (steady > hr ? 34 : 60);
      tired += v > 0.95 * cs ? 1 : 0;
      const hard = p.kind === 'rep' || p.kind === 'race' ? f : 0; // through a hard effort the stride quickens and the contact lengthens
      const spm = moving ? Math.round(Math.min(198, 164 + 13 * (v - 3.5) + 1.5 * hard + cadW.step())) : 0;
      const vo = 92 - 6 * (v - 3.5) + voW.step() + gauss() * 1.2;
      const step = moving ? (v * 60 * 1000) / spm : 0;
      const [lat, lon] = toLatLon(...r.at(dist).map((c, i) => c + (i ? py : px).step()));
      const speed = Math.max(0, v * (1 + gps.step()));
      const rec = {
        timestamp: new Date(start.getTime() + t * 1000), positionLat: Math.round(lat * DEG), positionLong: Math.round(lon * DEG),
        distance: Math.round(dist * 100) / 100, enhancedSpeed: Math.round(speed * 1000) / 1000, heartRate: Math.round(Math.min(HR_MAX + 2, hr + hrW.step())),
        enhancedAltitude: Math.round((alt + altW.step()) * 5) / 5, temperature: temp,
      };
      if (moving) Object.assign(rec, {
        cadence: Math.floor(spm / 2), fractionalCadence: (spm % 2) / 2,
        // Ground contact: shorter the faster, 7 ms shorter in the newer shoes, longer as the hard running adds up.
        stanceTime: Math.round(250 - 32 * (v - 3.5) - (newShoes ? 7 : 0) + tired * 0.004 + 3 * hard + gctW.step() + gauss() * 2),
        verticalOscillation: Math.round(vo * 10) / 10, verticalRatio: Math.round((vo / step) * 10000) / 100, stepLength: Math.round(step),
        power: Math.max(0, Math.round(63 * v * economy * (1 + 9 * grade) + (target - v) * 14 + gauss() * 6)),
      });
      enc.onMesg(Profile.MesgNum.RECORD, rec);
      dist += v; t++;
      if (autoLap && dist - lapD >= 1000) closeLap();
    }
    if (p.lap) closeLap();
  }
  closeLap();
  const stop = new Date(start.getTime() + t * 1000);
  for (const l of laps) enc.onMesg(Profile.MesgNum.LAP, l);
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: stop, startTime: start, sport: 'running', totalElapsedTime: t, totalTimerTime: t, totalDistance: Math.round(dist * 100) / 100, avgTemperature: temp, numLaps: laps.length });
  enc.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: stop, numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop' });
  const iso = start.toISOString();
  fs.writeFileSync(path.join(OUT, 'fit', `${iso.slice(0, 10)}_run.fit`), enc.close());
  return iso.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

const wu = { seconds: 900, share: 0.7, kind: 'easy', lap: true };
const cd = { seconds: 600, share: 0.68, kind: 'easy', lap: true };
/** n repetitions with their recoveries; the last one a little faster, as runners do. */
const reps = (n, work, jog) => Array.from({ length: n }, (_, i) => [{ ...work, share: work.share * (i === n - 1 ? 1.015 : 1), kind: 'rep', lap: true }, { ...jog, seconds: Math.round(jog.seconds * (0.9 + 0.25 * rnd())), kind: 'jog', lap: true }]).flat();
/** An all-out race over `metres`: the pace the critical speed model gives, t = (d − D′) / CS. */
const race = (metres, day) => ({ metres, share: metres / ((metres - D_PRIME) / csOn(day)) / csOn(day), kind: 'race', lap: true });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'fit'), { recursive: true });
const tags = {};
const first = new Date(END.getTime() - (WEEKS * 7 - 1) * DAY);
const RACES = [3000, 5000, 1500, 10000];
let runs = 0;
const SICK_WEEK = 9; // a cold: two short runs that week
for (let day = 0; day < WEEKS * 7; day++) {
  const date = new Date(first.getTime() + day * DAY);
  const week = Math.floor(day / 7);
  const dow = date.getUTCDay(); // 0 Sunday
  const at = (h, m) => new Date(date.getTime() + (h * 60 + Math.round(m + noise(25))) * 60_000);
  const easy = (metres) => ({ type: 'easy', route: 'loop', autoLap: true, stops: rnd() < 0.35 ? 1 + Math.round(rnd()) : 0, parts: [{ metres: Math.round(metres + noise(700)), share: 0.73 + gauss() * 0.012, kind: 'easy' }] });
  let run = null;
  if (week === SICK_WEEK) { if (dow === 4 || dow === 6) run = easy(6000); }
  else if (dow === 1) run = rnd() < 0.1 ? null : easy(10000 + 1000 * (week % 3));
  else if (dow === 2) {
    const k = week % 3;
    const n = [6, 10, 5][k] + (rnd() < 0.25 ? (rnd() < 0.5 ? -1 : 1) : 0);
    const main = k === 0 ? reps(n, { metres: 1000, share: 1.055 }, { seconds: 120, share: 0.55 }) : k === 1 ? reps(n, { metres: 400, share: 1.13 }, { seconds: 75, share: 0.5 }) : reps(n, { metres: 1200, share: 1.075 }, { seconds: 150, share: 0.55 });
    run = { type: 'intervals', route: 'track', title: [`${n} × 1 km`, `${n} × 400 m`, `${n} × 1200 m`][k], parts: [wu, ...main, cd] };
  } else if (dow === 3) run = rnd() < 0.1 ? null : easy(8000 + 1000 * (week % 2));
  else if (dow === 4) {
    const main = week % 2 ? reps(3, { seconds: 600, share: 0.985 }, { seconds: 120, share: 0.6 }) : [{ seconds: 1200 + 300 * (week % 3), share: 0.955, kind: 'steady', lap: true }];
    run = { type: 'tempo', route: 'loop', title: week % 2 ? '3 × 10 min' : 'Tempo', parts: [wu, ...main, cd] };
  } else if (dow === 6) {
    if (week % 3 === 2) {
      const metres = RACES[Math.floor(week / 3) % RACES.length];
      run = { type: 'race', route: metres > 5000 ? 'loop' : 'track', title: metres === 10000 ? '10 km race' : `${metres} m race`, parts: [wu, race(metres, day), cd] };
    } else run = easy(8000);
  } else if (dow === 0) run = { type: 'long', route: 'loop', autoLap: true, stops: rnd() < 0.5 ? 1 : 0, parts: [{ metres: Math.round(20000 + 2000 * (week % 4) + noise(900)), share: 0.75 + gauss() * 0.01, kind: 'steady' }] };
  if (!run) continue;
  const id = writeRun({ start: dow === 0 || dow === 6 ? at(8, 30) : at(6, 30), day, route: run.route, parts: run.parts, autoLap: run.autoLap, stops: run.stops ?? 0 });
  tags[id] = { workoutType: run.type, ...(run.title ? { title: run.title } : {}) };
  runs++;
}

// The folder's user files: what a runner would have entered.
const user = path.join(OUT, '.isostride/user');
fs.mkdirSync(user, { recursive: true });
const json = (name, value) => fs.writeFileSync(path.join(user, name), JSON.stringify(value, null, 2));
const day = (d) => d.toISOString().slice(0, 10);
json('gear.json', { gear: [
  { id: 'g-shoes-1', name: 'Tempo 2', type: 'shoes', from: day(first), to: day(new Date(SHOES_CHANGE.getTime() - DAY)) },
  { id: 'g-shoes-2', name: 'Tempo 3', type: 'shoes', from: day(SHOES_CHANGE), to: null },
  { id: 'g-strap', name: 'Chest strap', type: 'hrSensor', from: day(first), to: null },
] });
json('run-tags.json', { dictionary: { workoutTypes: ['easy', 'long', 'tempo', 'intervals', 'race'], techniqueCues: [] }, tags });
json('settings.json', {
  schemaVersion: 1,
  zones: { heartRate: [114, 133, 152, 171], speed: [252, 222, 207, 193], cadence: [165, 175, 185], power: [258, 291, 323, 371], groundContactTime: [200, 215, 230, 245], verticalOscillation: [78, 84, 90, 96] },
  performance: { load: 'trimpBanister', restHr: HR_REST, maxHr: HR_MAX, sex: 'male', thresholdPace: null, thresholdPower: null, fitnessDays: 42, fatigueDays: 7, confirmed: true },
});
const filter = { dateFrom: null, dateTo: null, title: '', workoutTypes: [], techniqueCues: [], shoes: [], heartRateSources: [], devices: [], lapsMin: null, lapsMax: null };
const conditions = { paceMin: null, paceMax: null, hrMin: null, hrMax: null, distanceMin: null, distanceMax: null, durationMin: null, durationMax: null, alwaysHrMin: null, alwaysHrMax: null, alwaysPaceMin: null, alwaysPaceMax: null, start: 'any' };
const tolerances = { paceMin: null, paceMax: null, gradeMax: 0.04, routeShare: 0.9, routeRadius: 30, cvMax: 0.15, effortBeforeMax: null, hrSkip: null, start: 'any' };
const block = (id, name, shape, extra = {}) => ({ id, name, origin: 'manual', status: 'active', createdAt: `${day(first)}T12:00:00.000Z`, params: { type: 'rule', runs: { ...filter, ...(extra.runs ?? {}) }, shape, conditions: { ...conditions, ...(extra.conditions ?? {}) }, pick: extra.pick ?? 'all', stat: 'avg' }, tolerances: { ...tolerances, ...(extra.tolerances ?? {}) } });
json('block-definitions.json', { definitions: [
  block('b-demo-10min', '10-minute effort', { type: 'fastest', kind: 'time', target: 600, effort: true }, { pick: 'best', tolerances: { hrSkip: 300 } }),
  block('b-demo-1km', '1 km reps', { type: 'lap', planned: { kind: 'distance', target: 1000 } }, { runs: { workoutTypes: ['intervals'] } }),
  block('b-demo-easy', 'Easy runs', { type: 'run' }, { runs: { workoutTypes: ['easy'] } }),
] });
json('dashboard.json', { tiles: [
  { id: 'week', kind: 'week' }, { id: 'form', kind: 'form' }, { id: 'last', kind: 'last' },
  { id: 'perf:load/form', kind: 'perf', ref: 'load/form', name: 'Load · Form', size: 2 },
  { id: 'perf:capacity/critical', kind: 'perf', ref: 'capacity/critical', name: 'Capacity · Critical speed and power', size: 2 },
  { id: 'weekly', kind: 'weekly' }, { id: 'recent', kind: 'recent' },
] });
console.log(`${runs} runs from ${day(first)} to ${day(END)} in ${OUT}`);
