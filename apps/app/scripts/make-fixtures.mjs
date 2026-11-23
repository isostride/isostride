// Writes the synthetic FIT fixtures in tests/fixtures (requirement "Versioned FIT fixtures").
// Fictional runs on a straight track in a park that is not the runner's (no personal data),
// built from round numbers so that tests/fixtures/expected.json can be checked by hand.
// Run once; the files are versioned and change only through a reviewed change.
import fs from 'node:fs';
import { Encoder, Profile } from '@garmin/fitsdk';

const DIR = 'tests/fixtures';
const START = new Date('2026-06-01T07:00:00Z');
const DEG = 2 ** 31 / 180; // degrees → semicircles

/** segments: [{ seconds, speed, hr }]; laps split at segment ends when laps = true. */
function run({ file, sport = 'running', start = START, segments, laps = false, effortRatio = 1 }) {
  const appId = Array.from({ length: 16 }, (_, i) => i + 1);
  const devId = { mesgNum: Profile.MesgNum.DEVELOPER_DATA_ID, developerDataIndex: 0, applicationId: appId, applicationVersion: 1 };
  const effort = { mesgNum: Profile.MesgNum.FIELD_DESCRIPTION, developerDataIndex: 0, fieldDefinitionNumber: 0, fitBaseTypeId: Profile.types.fitBaseType?.float32 ?? 136, fieldName: 'Effort Pace', units: 'm/s', nativeMesgNum: Profile.MesgNum.RECORD };
  const lss = { mesgNum: Profile.MesgNum.FIELD_DESCRIPTION, developerDataIndex: 0, fieldDefinitionNumber: 1, fitBaseTypeId: Profile.types.fitBaseType?.float32 ?? 136, fieldName: 'Leg Spring Stiffness', units: 'kN/m', nativeMesgNum: Profile.MesgNum.RECORD };
  const enc = new Encoder({ fieldDescriptions: { 0: { developerDataIdMesg: devId, fieldDescriptionMesg: effort }, 1: { developerDataIdMesg: devId, fieldDescriptionMesg: lss } } });
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'development', product: 1, timeCreated: start, serialNumber: 1234 });
  enc.onMesg(Profile.MesgNum.DEVICE_INFO, { timestamp: start, deviceIndex: 'creator', productName: 'Fixture Watch' });
  enc.writeMesg(devId);
  enc.writeMesg(effort);
  enc.writeMesg(lss);
  let t = 0;
  let dist = 0;
  const lapMesgs = [];
  for (const seg of segments) {
    const lapStart = t;
    const lapDist = dist;
    for (let k = 0; k < seg.seconds; k++, t++) {
      const ts = new Date(start.getTime() + t * 1000);
      enc.onMesg(Profile.MesgNum.RECORD, {
        timestamp: ts,
        positionLat: Math.round(50 * DEG), positionLong: Math.round((10 + dist / 71_700) * DEG), // due east, 71.7 km per degree at 50° N
        distance: dist, enhancedSpeed: seg.speed, heartRate: seg.hr, cadence: 85, fractionalCadence: 0,
        stanceTime: 250, verticalOscillation: 80, stepLength: 1180, power: 250, enhancedAltitude: 100, temperature: 15,
        developerFields: { 0: seg.speed * effortRatio, 1: 10 },
      });
      dist += seg.speed;
    }
    if (laps) lapMesgs.push({ timestamp: new Date(start.getTime() + t * 1000), startTime: new Date(start.getTime() + lapStart * 1000), totalElapsedTime: seg.seconds, totalTimerTime: seg.seconds, totalDistance: dist - lapDist, sport });
  }
  if (!laps) lapMesgs.push({ timestamp: new Date(start.getTime() + t * 1000), startTime: start, totalElapsedTime: t, totalTimerTime: t, totalDistance: dist, sport });
  for (const l of lapMesgs) enc.onMesg(Profile.MesgNum.LAP, l);
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(start.getTime() + t * 1000), startTime: start, sport, totalElapsedTime: t, totalTimerTime: t, totalDistance: dist, avgTemperature: 15, numLaps: lapMesgs.length });
  enc.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: new Date(start.getTime() + t * 1000), numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop' });
  const bytes = enc.close();
  fs.writeFileSync(`${DIR}/${file}`, bytes);
  return bytes;
}

fs.mkdirSync(DIR, { recursive: true });
// 25 min at exactly 5:00/km (10/3 m/s): 5000 m.
const steady = run({ file: 'steady-5k.fit', segments: [{ seconds: 1500, speed: 10 / 3, hr: 145 }] });
// 10 min warm-up at 2.9 m/s, a 25-minute lap at 4:00/km (25/6 m/s), 5 min cool-down at 2.8 m/s: 1740 + 6250 + 840 m.
run({ file: 'tempo-25min.fit', start: new Date('2026-06-03T07:00:00Z'), laps: true, segments: [{ seconds: 600, speed: 2.9, hr: 130 }, { seconds: 1500, speed: 25 / 6, hr: 165 }, { seconds: 300, speed: 2.8, hr: 140 }] });
// A hike: not a run.
run({ file: 'hike.fit', sport: 'hiking', start: new Date('2026-06-05T07:00:00Z'), segments: [{ seconds: 600, speed: 1.2, hr: 100 }] });
// The steady run cut short: a damaged file.
fs.writeFileSync(`${DIR}/damaged.fit`, steady.slice(0, Math.floor(steady.length / 2)));
console.log(fs.readdirSync(DIR));
