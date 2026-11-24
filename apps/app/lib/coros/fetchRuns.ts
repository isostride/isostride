import { PATHS, fitDirectory, joinPath, readJson, writeJson, type DataFolder } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import type { CallTool } from './mcp';
import { isFitFile, readFitLinks, readSportRecords, recordsCounted } from './text';

/**
 * The runs of the runner's COROS account fetched into the data folder (requirements "Runs fetched from
 * COROS" and "COROS fetch stopped kept"): the runs of the days since the last full fetch (30 days at
 * the first) listed with querySportRecords, which counts against no limit; for each run no fetch has
 * brought, its FIT link asked of queryActivityFitFileDownloadUrls (a file of COROS's 50 a day), the
 * file downloaded and written beside the folder's FIT files. What was fetched is kept in
 * user/coros.json after each file, so a fetch stopped or interrupted loses nothing and asks nothing twice.
 */

/** COROS's sport types of runs: outdoor, indoor, trail, track. */
export const RUN_SPORT_TYPES = [100, 101, 102, 103];
/** How far back the first fetch goes, days. */
export const FIRST_FETCH_DAYS = 30;
/** The most runs listed by one fetch. */
const LIST_LIMIT = 100;

/** user/coros.json: what was fetched from COROS into this folder. */
export interface CorosRecord {
  /** the file written for each activity fetched, by its labelId */
  fetched: Record<string, string>;
  /** the day of the last fetch that ended with nothing left, yyyy-mm-dd */
  since?: string;
}

export interface FetchReport {
  /** the runs of the days asked that no fetch had brought */
  missing: number;
  /** the files written into the folder by this fetch */
  files: string[];
  /** COROS's words when it refused a run or the fetch, else null */
  stopped: string | null;
}

export interface FetchOptions {
  /** downloads a FIT link's bytes */
  download?: (url: string) => Promise<Uint8Array>;
  /** today, for the days asked */
  today?: Date;
  /** called after each run, with how many are done of how many */
  progress?: (done: number, total: number) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A day as yyyy-mm-dd, in the runner's time zone. */
export const dayOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const compact = (day: string) => day.replace(/-/g, '');
const daysBefore = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d - n));
};

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  // i18n-ignore: the detail of a failure, shown as it is
  if (!res.ok) throw new Error(`COROS gave HTTP ${res.status} for ${url.split('/').pop()}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function readCorosRecord(folder: DataFolder): Promise<CorosRecord> {
  const r = await readJson<CorosRecord>(folder, PATHS.coros);
  return { fetched: r?.fetched ?? {}, ...(r?.since ? { since: r.since } : {}) };
}

/** Fetches the runs of COROS that the folder has not got; see the top of this file. */
export async function fetchCorosRuns(folder: DataFolder, call: CallTool, opts: FetchOptions = {}): Promise<FetchReport> {
  const download = opts.download ?? downloadBytes;
  const today = dayOf(opts.today ?? new Date());
  const record = await readCorosRecord(folder);
  const from = record.since ? daysBefore(record.since, 1) : daysBefore(today, FIRST_FETCH_DAYS);
  const report: FetchReport = { missing: 0, files: [], stopped: null };

  const list = await call('querySportRecords', { startDate: compact(from), endDate: compact(today), sportTypeCodes: RUN_SPORT_TYPES, limit: LIST_LIMIT });
  if (list.isError) return { ...report, stopped: list.text };
  const activities = readSportRecords(list.text);
  // A list read short (its count says more activities than were read) is no complete fetch: what was
  // read is fetched, the day does not move, and the runner is told.
  const counted = recordsCounted(list.text);
  // i18n-ignore: the detail of a stop, shown as it is
  const readShort = counted !== null && counted !== activities.length ? `IsoStride read ${activities.length} of the ${counted} activities COROS listed.` : null;
  // A run the folder already holds (exported by hand: the same start, to 2 s) is not downloaded again:
  // it would be a duplicate and spend a file of the day's 50.
  const index = await readJson<RunsIndex>(folder, PATHS.runsIndex);
  const held = (index?.runs ?? []).map((r) => ({ start: Date.parse(r.startTime) / 1000, file: r.file }));
  for (const a of activities) {
    if (record.fetched[a.labelId] || a.start === null) continue;
    const same = held.find((h) => Math.abs(h.start - a.start!) <= 2);
    if (same) record.fetched[a.labelId] = same.file;
  }
  const missing = activities.filter((a) => RUN_SPORT_TYPES.includes(a.sportType) && !record.fetched[a.labelId]);
  report.missing = missing.length;
  const dir = await fitDirectory(folder);
  /** a run left for the next fetch (still in progress) */
  let leftOver = false;

  for (const [i, a] of missing.entries()) {
    const answer = await call('queryActivityFitFileDownloadUrls', { labelId: a.labelId, sportType: a.sportType });
    const link = answer.isError ? undefined : readFitLinks(answer.text)[0];
    if (!link) {
      // A run still being recorded has its file later: the others go on. Anything else (the limit
      // of the day, the account) stops the fetch.
      if (/in progress/i.test(answer.text)) {
        leftOver = true;
        opts.progress?.(i + 1, missing.length);
        continue;
      }
      // i18n-ignore: COROS gave neither a link nor its reason; shown as the detail
      report.stopped = answer.text || 'COROS gave no FIT file';
      break;
    }
    const bytes = await download(link.url);
    if (!isFitFile(bytes)) {
      // i18n-ignore: the detail of a failure, shown as it is
      report.stopped = `${link.name} is not a FIT file`;
      break;
    }
    const path = joinPath(dir, link.name);
    await folder.writeBytes(path, bytes);
    record.fetched[a.labelId] = path;
    await writeJson(folder, PATHS.coros, record);
    report.files.push(path);
    opts.progress?.(i + 1, missing.length);
  }

  // The day moves on only when nothing of the days asked is left behind; a full list may hide more.
  if (readShort && !report.stopped) report.stopped = readShort;
  if (!report.stopped && !leftOver && activities.length < LIST_LIMIT) {
    record.since = today;
    await writeJson(folder, PATHS.coros, record);
  }
  return report;
}
