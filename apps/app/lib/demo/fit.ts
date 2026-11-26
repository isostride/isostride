/**
 * A FIT activity file written directly: the few messages a watch writes for a run (file id, device, a
 * record a second, laps, session, activity), with fixed fields. The FIT SDK's own encoder took a tenth
 * of a second a run, a minute for the demo's two years; this takes about a millisecond.
 *
 * Beside the bytes it gives the messages as the SDK's decoder reads them back from those bytes (each
 * value the raw one divided by its scale, less its offset), so an import can take the run without
 * decoding the file it was just written to. A test holds the two to each other.
 */

/** Seconds from 1 Jan 1970 to the FIT epoch (31 Dec 1989). */
const FIT_EPOCH = 631_065_600;
const U8 = 0x02; const S8 = 0x01; const ENUM = 0x00; const U16 = 0x84; const S32 = 0x85; const U32 = 0x86; const U32Z = 0x8c; const STRING = 0x07;
const NAME_SIZE = 16;

/** [field number, size in bytes, base type] */
type Field = [number, number, number];
const FILE_ID: Field[] = [[0, 1, ENUM], [1, 2, U16], [2, 2, U16], [3, 4, U32Z], [4, 4, U32]];
const DEVICE_INFO: Field[] = [[253, 4, U32], [0, 1, U8], [2, 2, U16], [4, 2, U16], [27, NAME_SIZE, STRING]];
const RECORD: Field[] = [[253, 4, U32], [0, 4, S32], [1, 4, S32], [5, 4, U32], [73, 4, U32], [3, 1, U8], [78, 4, U32], [13, 1, S8], [4, 1, U8], [53, 1, U8], [41, 2, U16], [39, 2, U16], [83, 2, U16], [85, 2, U16], [7, 2, U16]];
const LAP: Field[] = [[254, 2, U16], [253, 4, U32], [2, 4, U32], [7, 4, U32], [8, 4, U32], [9, 4, U32], [25, 1, ENUM], [0, 1, ENUM], [1, 1, ENUM]];
const SESSION: Field[] = [[254, 2, U16], [253, 4, U32], [2, 4, U32], [7, 4, U32], [8, 4, U32], [9, 4, U32], [5, 1, ENUM], [6, 1, ENUM], [57, 1, S8], [25, 2, U16], [26, 2, U16], [0, 1, ENUM], [1, 1, ENUM]];
const ACTIVITY: Field[] = [[253, 4, U32], [0, 4, U32], [1, 2, U16], [2, 1, ENUM], [3, 1, ENUM], [4, 1, ENUM]];
const sizeOf = (fields: Field[]) => 1 + fields.reduce((a, f) => a + f[1], 0);
const RECORD_SIZE = sizeOf(RECORD);

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crc16(bytes: Uint8Array, from: number, to: number): number {
  let crc = 0;
  for (let i = from; i < to; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

/** A second of a run as the file holds it: whole numbers in the units of the FIT fields. */
export interface RawRecord {
  /** s from the start */
  t: number;
  /** semicircles; null without GPS */
  lat: number | null;
  lon: number | null;
  /** cm */
  distance: number;
  /** mm/s */
  speed: number;
  heartRate: number;
  /** (m + 500) × 5; null without it */
  altitude: number | null;
  /** °C */
  temperature: number;
  /** what the watch measures of the stride, only while moving: strides/min, half a stride (0 or 64 of 128), 0.1 ms, 0.1 mm, 0.01 %, 0.1 mm, W */
  stride: { cadence: number; fraction: number; stance: number; oscillation: number; ratio: number; step: number; power: number } | null;
}

/** A run's messages as the FIT SDK's decoder gives them (what lib/ingest reads). */
export type FitMessages = Record<string, Record<string, unknown>[]>;

/** Writes one run's FIT file, a record at a time. */
export class FitWriter {
  private bytes: Uint8Array;
  private view: DataView;
  private at = 14;
  private readonly startSeconds: number;
  private readonly records: Record<string, unknown>[] = [];
  private readonly laps: { from: number; to: number; metres: number }[] = [];

  constructor(private readonly start: Date, private readonly device: string, seconds: number) {
    this.bytes = new Uint8Array(1024 + (seconds + 600) * RECORD_SIZE);
    this.view = new DataView(this.bytes.buffer);
    this.startSeconds = Math.round(start.getTime() / 1000) - FIT_EPOCH;
    this.define(0, 0, FILE_ID);
    this.head(0); this.u8(4); this.u16(255); this.u16(1); this.u32(4242); this.u32(this.startSeconds);
    this.define(1, 23, DEVICE_INFO);
    this.head(1); this.u32(this.startSeconds); this.u8(0); this.u16(255); this.u16(1);
    for (let i = 0; i < NAME_SIZE; i++) this.u8(i < device.length && i < NAME_SIZE - 1 ? device.charCodeAt(i) : 0);
    this.define(2, 20, RECORD);
  }

  private room(n: number): void {
    if (this.at + n <= this.bytes.length) return;
    const bigger = new Uint8Array(this.bytes.length * 2 + n);
    bigger.set(this.bytes);
    this.bytes = bigger;
    this.view = new DataView(bigger.buffer);
  }
  private u8(v: number): void { this.view.setUint8(this.at, v); this.at += 1; }
  private u16(v: number): void { this.view.setUint16(this.at, v, true); this.at += 2; }
  private u32(v: number): void { this.view.setUint32(this.at, v, true); this.at += 4; }
  private s32(v: number): void { this.view.setInt32(this.at, v, true); this.at += 4; }
  private head(local: number): void { this.room(64); this.u8(local); }
  private define(local: number, global: number, fields: Field[]): void {
    this.room(8 + fields.length * 3);
    this.u8(0x40 | local); this.u8(0); this.u8(0); this.u16(global); this.u8(fields.length);
    for (const [num, size, type] of fields) { this.u8(num); this.u8(size); this.u8(type); }
  }

  record(r: RawRecord): void {
    this.head(2);
    this.u32(this.startSeconds + r.t);
    this.s32(r.lat ?? 0x7fffffff); this.s32(r.lon ?? 0x7fffffff);
    this.u32(r.distance); this.u32(r.speed); this.u8(r.heartRate);
    this.u32(r.altitude ?? 0xffffffff);
    this.view.setInt8(this.at, r.temperature); this.at += 1;
    const s = r.stride;
    this.u8(s ? s.cadence : 0xff); this.u8(s ? s.fraction : 0xff);
    this.u16(s ? s.stance : 0xffff); this.u16(s ? s.oscillation : 0xffff); this.u16(s ? s.ratio : 0xffff); this.u16(s ? s.step : 0xffff); this.u16(s ? s.power : 0xffff);
    // The same record as the decoder reads it: the fields in the order of the file, the missing ones left out.
    const m: Record<string, unknown> = { timestamp: new Date((this.startSeconds + r.t + FIT_EPOCH) * 1000) };
    if (r.lat !== null && r.lon !== null) { m.positionLat = r.lat; m.positionLong = r.lon; }
    m.distance = r.distance / 100;
    m.enhancedSpeed = r.speed / 1000;
    m.heartRate = r.heartRate;
    if (r.altitude !== null) m.enhancedAltitude = r.altitude / 5 - 500;
    m.temperature = r.temperature;
    if (s) { m.cadence = s.cadence; m.fractionalCadence = s.fraction / 128; m.stanceTime = s.stance / 10; m.verticalOscillation = s.oscillation / 10; m.verticalRatio = s.ratio / 100; m.stepLength = s.step / 10; m.power = s.power; }
    this.records.push(m);
  }

  /** A lap from a second of the run to another, of so many metres. */
  lap(from: number, to: number, metres: number): void {
    this.laps.push({ from, to, metres });
  }

  /** The laps, the session and the activity written, and the file closed. */
  finish(seconds: number, metres: number, temperature: number, indoor: boolean): { fit: Uint8Array; messages: FitMessages } {
    const end = this.startSeconds + seconds;
    const cm = Math.round(metres * 100);
    this.define(3, 19, LAP);
    const lapMesgs = this.laps.map((l, i) => {
      const lapCm = Math.round(l.metres * 100);
      this.head(3); this.u16(i); this.u32(this.startSeconds + l.to); this.u32(this.startSeconds + l.from); this.u32((l.to - l.from) * 1000); this.u32((l.to - l.from) * 1000); this.u32(lapCm); this.u8(1); this.u8(9); this.u8(1);
      return { startTime: new Date((this.startSeconds + l.from + FIT_EPOCH) * 1000), totalElapsedTime: l.to - l.from, totalTimerTime: l.to - l.from, totalDistance: lapCm / 100 };
    });
    this.define(4, 18, SESSION);
    this.head(4); this.u16(0); this.u32(end); this.u32(this.startSeconds); this.u32(seconds * 1000); this.u32(seconds * 1000); this.u32(cm); this.u8(1); this.u8(indoor ? 1 : 0);
    this.view.setInt8(this.at, temperature); this.at += 1;
    this.u16(0); this.u16(this.laps.length); this.u8(8); this.u8(1);
    this.define(5, 34, ACTIVITY);
    this.head(5); this.u32(end); this.u32(seconds * 1000); this.u16(1); this.u8(0); this.u8(26); this.u8(1);
    // The header, once the size of the data is known, and the two checksums.
    const size = this.at - 14;
    this.room(2);
    this.view.setUint8(0, 14); this.view.setUint8(1, 0x20); this.view.setUint16(2, 21222, true); this.view.setUint32(4, size, true);
    this.bytes.set([0x2e, 0x46, 0x49, 0x54], 8);
    this.view.setUint16(12, crc16(this.bytes, 0, 12), true);
    this.view.setUint16(this.at, crc16(this.bytes, 0, this.at), true);
    return {
      fit: this.bytes.slice(0, this.at + 2),
      messages: {
        fileIdMesgs: [{ manufacturer: 'development' }],
        deviceInfoMesgs: [{ productName: this.device }],
        recordMesgs: this.records,
        lapMesgs,
        sessionMesgs: [{ sport: 'running', startTime: this.start, totalElapsedTime: seconds, totalTimerTime: seconds, totalDistance: cm / 100, avgTemperature: temperature }],
      },
    };
  }
}
