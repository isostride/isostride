import { PATHS, readJson, writeJson, type DataFolder } from '@/lib/fs';
import { msg } from '@/lib/i18n';
import type { IndexedRun, Series } from '@/lib/kernel';

/**
 * The Dashboard (the runner's request of 22 Nov 2026: "dodaj jeszcze jedna sekcje na sama gore -
 * dashboard ... tam uzytkownik bedzie mogl zobaczyc najwazniejsze dla niego rzeczy"; requirement
 * "Dashboard of the runner's tiles"): the tiles the runner chooses, in their order, kept in the data
 * folder (user/dashboard.json), and the figures of the tiles of running by week.
 */

/**
 * The kinds of tile; a run, a segment, an analysis and a model tile name the one it shows (ref); a
 * view of Performance (perf) names its tab and view ("load/form"), a chart of Compare (compare) the
 * analysis' query. A widget pinned from its card (the runner's "Pin na kazdej karcie-widgecie") shows
 * there as it does on its screen.
 */
export type TileKind = 'week' | 'weekly' | 'last' | 'form' | 'run' | 'segment' | 'analysis' | 'model' | 'recent' | 'perf' | 'compare';

export interface Tile {
  id: string;
  kind: TileKind;
  /** the run's id, the segment's id, the saved analysis' id, the model's key, the view or the query */
  ref?: string;
  /** the name the widget had where it was pinned */
  name?: string;
  /** how the widget was set where it was pinned (a run's metrics shown, "speed,heartRate") */
  opts?: string;
  /** its width in thirds of the row, set in Customize; else its kind's */
  size?: TileSize;
}

export type TileSize = 1 | 2 | 3;

/** A kind's width in thirds of the row: the charts pinned from their cards the whole row, the weekly distance two thirds, the rest one. */
export function sizeOf(t: Tile): TileSize {
  if (t.size) return t.size;
  if (t.kind === 'run' || t.kind === 'perf' || t.kind === 'compare' || t.kind === 'analysis') return 3;
  return t.kind === 'weekly' ? 2 : 1;
}

/** The next width of a tile in Customize: one third, two, the whole row, then one again. */
export function resizeTile(tiles: Tile[], id: string): Tile[] {
  return tiles.map((t) => (t.id === id ? { ...t, size: ((sizeOf(t) % 3) + 1) as TileSize } : t));
}

export interface DashboardFile {
  tiles: Tile[];
}

/** The kinds a runner can add, in the order offered; those naming one thing say what. Their titles are keys, shown with t(). */
export const TILE_KINDS: { kind: TileKind; title: string; of?: 'run' | 'segment' | 'analysis' | 'model' | 'perf' }[] = [
  { kind: 'week', title: msg('This week') },
  { kind: 'weekly', title: msg('Weekly distance') },
  { kind: 'last', title: msg('Last run') },
  { kind: 'form', title: msg('Form today') },
  { kind: 'recent', title: msg('Recent runs') },
  { kind: 'run', title: msg('A run'), of: 'run' },
  { kind: 'segment', title: msg('A segment'), of: 'segment' },
  { kind: 'analysis', title: msg('A saved analysis'), of: 'analysis' },
  { kind: 'model', title: msg('A model of Performance'), of: 'model' },
  { kind: 'perf', title: msg('A chart of Performance'), of: 'perf' },
];

/** The tiles of a dashboard the runner has not set (the runner's \"tak\" to them). */
export const DEFAULT_TILES: Tile[] = (['week', 'form', 'last', 'weekly', 'recent'] as const).map((kind) => ({ id: kind, kind }));

/** The tiles kept, or the defaults when none are; a tile of an unknown kind is left out. */
export async function readDashboard(folder: DataFolder): Promise<Tile[]> {
  const file = await readJson<DashboardFile>(folder, PATHS.dashboard);
  if (!file || !Array.isArray(file.tiles)) return DEFAULT_TILES;
  return file.tiles.filter((t) => (t.kind === 'compare' || TILE_KINDS.some((k) => k.kind === t.kind)) && typeof t.id === 'string');
}

export async function writeDashboard(folder: DataFolder, tiles: Tile[]): Promise<void> {
  await writeJson(folder, PATHS.dashboard, { tiles } satisfies DashboardFile);
}

/** Adds a tile at the end, with the name and the setting of the widget pinned; the same kind of the same thing is not added twice. */
export function addTile(tiles: Tile[], kind: TileKind, ref?: string, extra: { name?: string; opts?: string } = {}): Tile[] {
  if (tiles.some((t) => t.kind === kind && t.ref === ref)) return tiles;
  return [...tiles, { id: ref ? `${kind}:${ref}` : kind, kind, ...(ref ? { ref } : {}), ...(extra.name ? { name: extra.name } : {}), ...(extra.opts ? { opts: extra.opts } : {}) }];
}

export function removeTile(tiles: Tile[], id: string): Tile[] {
  return tiles.filter((t) => t.id !== id);
}

/** Moves a tile one place up (-1) or down (+1); at an end it stays. */
export function moveTile(tiles: Tile[], id: string, by: -1 | 1): Tile[] {
  const i = tiles.findIndex((t) => t.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= tiles.length) return tiles;
  const out = [...tiles];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** True when the dashboard holds a tile of that thing. */
export const hasTile = (tiles: Tile[], kind: TileKind, ref?: string) => tiles.some((t) => t.kind === kind && t.ref === ref);

/** The local Monday of a time's week. */
export function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const DAY = 86_400_000;
const weekIndex = (t: Date, monday: Date) => Math.round((mondayOf(t).getTime() - monday.getTime()) / (7 * DAY));

/** This week's running, Monday to Sunday, and the week before's distance, as of a day. */
export function weekFigures(runs: Pick<IndexedRun, 'startTime' | 'distance' | 'duration'>[], today: Date): { km: number; runs: number; time: number; byDay: number[]; lastWeekKm: number } {
  const monday = mondayOf(today);
  const byDay = new Array(7).fill(0);
  let km = 0, n = 0, time = 0, lastWeekKm = 0;
  for (const r of runs) {
    const t = new Date(r.startTime);
    const w = weekIndex(t, monday);
    if (w === 0) { byDay[(t.getDay() + 6) % 7] += r.distance / 1000; km += r.distance / 1000; n++; time += r.duration; }
    else if (w === -1) lastWeekKm += r.distance / 1000;
  }
  return { km, runs: n, time, byDay, lastWeekKm };
}

/**
 * What this week's distance is read against (the runner's "widgety ... wygladaja biednie", 26 Nov 2026):
 * last week's up to the same day of the week (a week half run against a whole one always reads behind),
 * and the mean of the four whole weeks before this one; null where there is none to compare with.
 */
export function weekContext(runs: Pick<IndexedRun, 'startTime' | 'distance'>[], today: Date): { lastWeekToDateKm: number; averageKm: number | null; weeks: number } {
  const monday = mondayOf(today);
  const day = (today.getDay() + 6) % 7;
  const before = [0, 0, 0, 0];
  let lastWeekToDateKm = 0;
  for (const r of runs) {
    const at = new Date(r.startTime);
    const w = weekIndex(at, monday);
    if (w >= -4 && w <= -1) before[-w - 1] += r.distance / 1000;
    if (w === -1 && (at.getDay() + 6) % 7 <= day) lastWeekToDateKm += r.distance / 1000;
  }
  // Only the weeks since the first run count: a runner two weeks in has two weeks to average.
  const first = runs.reduce<number | null>((m, r) => { const w = weekIndex(new Date(r.startTime), monday); return m === null || w < m ? w : m; }, null);
  const weeks = first === null ? 0 : Math.min(4, Math.max(0, -first));
  return { lastWeekToDateKm, averageKm: weeks ? before.slice(0, weeks).reduce((a, b) => a + b, 0) / weeks : null, weeks };
}

/** The distance of each of the last `weeks` weeks up to the day's, oldest first: each week's Monday (YYYY-MM-DD) and km. */
export function weeklyDistance(runs: Pick<IndexedRun, 'startTime' | 'distance'>[], weeks: number, today: Date): { monday: string; km: number; runs: number }[] {
  const monday = mondayOf(today);
  const out = Array.from({ length: weeks }, (_, k) => {
    const m = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (weeks - 1 - k));
    return { monday: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`, km: 0, runs: 0 };
  });
  for (const r of runs) {
    const w = weekIndex(new Date(r.startTime), monday) + weeks - 1;
    if (w >= 0 && w < weeks) { out[w].km += r.distance / 1000; out[w].runs++; }
  }
  return out;
}

/**
 * A run's pace in a few points, for its tile: the speed averaged over equal stretches of the samples
 * (only while moving, above 1 m/s), as seconds a kilometre; a stretch without movement is left out.
 */
export function paceProfile(speed: Series, points = 80): number[] {
  const n = speed.length;
  if (!n) return [];
  const out: number[] = [];
  const size = Math.max(1, Math.ceil(n / points));
  for (let i = 0; i < n; i += size) {
    let sum = 0, k = 0;
    for (let j = i; j < Math.min(n, i + size); j++) {
      const v = speed[j];
      if (v !== null && v > 1) { sum += v; k++; }
    }
    if (k) out.push(1000 / (sum / k));
  }
  return out;
}
