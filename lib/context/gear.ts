import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs/folder';

export type GearType = 'shoes' | 'hrSensor';

/** A pair of shoes or a heart rate sensor, with the date range of its use (user/gear.json). */
export interface Gear {
  id: string;
  name: string;
  type: GearType;
  /** first day of use, YYYY-MM-DD */
  from: string;
  /** last day of use, YYYY-MM-DD; null while still in use */
  to: string | null;
}

export interface GearFile {
  gear: Gear[];
}

export async function readGear(folder: DataFolder): Promise<Gear[]> {
  return (await readJson<GearFile>(folder, PATHS.gear))?.gear ?? [];
}

export async function writeGear(folder: DataFolder, gear: Gear[]): Promise<void> {
  await writeJson(folder, PATHS.gear, { gear } satisfies GearFile);
}

/** The local calendar day of an ISO time, YYYY-MM-DD. */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The gear of a type whose date range of use covers the day; the most recently started when ranges overlap. */
export function gearOn(gear: Gear[], type: GearType, day: string): Gear | null {
  const covering = gear.filter((g) => g.type === type && g.from <= day && (g.to === null || day <= g.to));
  covering.sort((a, b) => b.from.localeCompare(a.from));
  return covering[0] ?? null;
}

export function newGearId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
