import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIRST_FETCH_DAYS, fetchCorosRuns, readCorosRecord, type CallTool, type ToolAnswer } from '@/lib/coros';
import { PATHS, listFitFiles, readJson } from '@/lib/fs';
import type { RunsIndex } from '@/lib/kernel';
import { importFolder } from '@/lib/pipeline';
import { FILES, TEST_DATA, makeDataFolder } from '../support/fixtures';
import { RECORDS, RECORDS_QUOTED, linkText } from '../support/coros';

/**
 * Runs fetched from COROS into the data folder (requirements "Runs fetched from COROS" and "COROS fetch
 * stopped kept"): COROS's MCP tools played by a fake that answers in COROS's text, its FIT links giving
 * real FIT files of the export.
 */

const TODAY = new Date(2026, 10, 24, 12);
/** The FIT file behind each link: two real runs of the export. */
const BEHIND: Record<string, string> = { 'r3_aa.fit': FILES.pace4, 'r2_bb.fit': FILES.later };
const FILE_OF: Record<string, string> = { '100000000000000003': 'r3_aa.fit', '100000000000000002': 'r2_bb.fit' };

/** A COROS of the three activities of RECORDS; `refuse` answers a labelId with COROS's refusal. */
function fakeCoros(refuse: Record<string, ToolAnswer> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const call: CallTool = async (name, args) => {
    calls.push({ name, args });
    if (name === 'querySportRecords') return { text: RECORDS, isError: false };
    const id = String(args.labelId);
    return refuse[id] ?? { text: linkText(FILE_OF[id]), isError: false };
  };
  const download = async (url: string) => new Uint8Array(await fs.readFile(path.join(TEST_DATA, BEHIND[url.split('/').pop()!])));
  return { calls, call, download, files: () => calls.filter((c) => c.name === 'queryActivityFitFileDownloadUrls').map((c) => c.args.labelId) };
}

describe('Runs fetched from COROS', () => {
  it('The runs not fetched before written into the folder and imported, never asked twice', async () => {
    const folder = await makeDataFolder([]);
    const coros = fakeCoros();
    const report = await fetchCorosRuns(folder, coros.call, { download: coros.download, today: TODAY });
    // The runs of the last 30 days, the walk left out.
    expect(coros.calls[0]).toEqual({ name: 'querySportRecords', args: { startDate: '20261025', endDate: '20261124', sportTypeCodes: [100, 101, 102, 103], limit: 100 } });
    expect(FIRST_FETCH_DAYS).toBe(30);
    expect(report).toEqual({ missing: 2, files: ['fit/r3_aa.fit', 'fit/r2_bb.fit'], stopped: null });
    expect(await listFitFiles(folder)).toEqual(['fit/r2_bb.fit', 'fit/r3_aa.fit']);
    expect(await readCorosRecord(folder)).toEqual({ fetched: { '100000000000000003': 'fit/r3_aa.fit', '100000000000000002': 'fit/r2_bb.fit' }, since: '2026-11-24' });
    expect((await importFolder(folder)).imported).toBe(2);
    expect((await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs).toHaveLength(2);

    // The next fetch, a day later: listed from 30 days before the last one (a run the watch gave COROS late is
    // dated before it), nothing asked again.
    const again = fakeCoros();
    const next = await fetchCorosRuns(folder, again.call, { download: again.download, today: new Date(2026, 10, 25, 12) });
    expect(again.calls[0].args).toMatchObject({ startDate: '20261025', endDate: '20261125' });
    expect(again.files()).toEqual([]);
    expect(next).toEqual({ missing: 0, files: [], stopped: null });
  });

  it('A fetch stopped by COROS keeps what it fetched and fetches the rest next time', async () => {
    const folder = await makeDataFolder([]);
    const limit = 'Daily FIT file limit reached: 50 files per 24 hours.';
    const first = fakeCoros({ '100000000000000002': { text: limit, isError: true } });
    const report = await fetchCorosRuns(folder, first.call, { download: first.download, today: TODAY });
    expect(report).toEqual({ missing: 2, files: ['fit/r3_aa.fit'], stopped: limit });
    // The day does not move: the next fetch asks the same days again.
    expect(await readCorosRecord(folder)).toEqual({ fetched: { '100000000000000003': 'fit/r3_aa.fit' } });

    const second = fakeCoros();
    const rest = await fetchCorosRuns(folder, second.call, { download: second.download, today: TODAY });
    expect(second.calls[0].args).toMatchObject({ startDate: '20261025' });
    expect(second.files()).toEqual(['100000000000000002']);
    expect(rest).toEqual({ missing: 1, files: ['fit/r2_bb.fit'], stopped: null });
    expect((await importFolder(folder)).imported).toBe(2);
  });

  it('A run still in progress left for the next fetch, the others fetched', async () => {
    const folder = await makeDataFolder([]);
    const coros = fakeCoros({ '100000000000000003': { text: 'This activity is still in progress; the FIT file is available after it ends.', isError: true } });
    const report = await fetchCorosRuns(folder, coros.call, { download: coros.download, today: TODAY });
    expect(report).toEqual({ missing: 2, files: ['fit/r2_bb.fit'], stopped: null });
    expect((await readCorosRecord(folder)).since).toBeUndefined();
  });

  it('A list refused, a link missing or a file that is no FIT file stop the fetch, nothing wrong written', async () => {
    const folder = await makeDataFolder([]);
    const coros = fakeCoros();
    const refusedList: CallTool = async (name, args) => (name === 'querySportRecords' ? { text: 'Service busy', isError: true } : coros.call(name, args));
    expect(await fetchCorosRuns(folder, refusedList, { download: coros.download, today: TODAY })).toEqual({ missing: 0, files: [], stopped: 'Service busy' });
    // COROS answers with neither a link nor a reason.
    const noLink = fakeCoros({ '100000000000000003': { text: '', isError: false } });
    expect(await fetchCorosRuns(folder, noLink.call, { download: noLink.download, today: TODAY })).toEqual({ missing: 2, files: [], stopped: 'COROS gave no FIT file' });
    // A page in place of the file.
    const html = async () => new TextEncoder().encode('<html>Access denied</html>');
    expect(await fetchCorosRuns(folder, coros.call, { download: html, today: TODAY })).toEqual({ missing: 2, files: [], stopped: 'r3_aa.fit is not a FIT file' });
    expect(await listFitFiles(folder)).toEqual([]);
    expect(await readCorosRecord(folder)).toEqual({ fetched: {} });
  });

  it('A full list leaves the day where it was: there may be more runs on those days', async () => {
    const folder = await makeDataFolder([]);
    const many = Array.from({ length: 100 }, (_, i) => `${i + 1}. Walk — 2026-11-20\n   LabelId: ${900000000000000000 + i} | SportType: 900`).join('\n\n');
    const call: CallTool = async () => ({ text: many, isError: false });
    expect(await fetchCorosRuns(folder, call, { today: TODAY })).toEqual({ missing: 0, files: [], stopped: null });
    expect((await readCorosRecord(folder)).since).toBeUndefined();
  });

  it('A download COROS refuses stops with its status', async () => {
    const folder = await makeDataFolder([]);
    const coros = fakeCoros();
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 403 })) as typeof fetch;
    try {
      await expect(fetchCorosRuns(folder, coros.call, { today: TODAY })).rejects.toThrow('COROS gave HTTP 403 for r3_aa.fit');
    } finally {
      globalThis.fetch = real;
    }
  });

  it('The list as COROS sends it read whole; a list read short is no complete fetch', async () => {
    // Quoted, its line breaks written out: both runs fetched, not the first alone.
    const folder = await makeDataFolder([]);
    const coros = fakeCoros();
    const quoted: CallTool = async (name, args) => (name === 'querySportRecords' ? { text: RECORDS_QUOTED, isError: false } : coros.call(name, args));
    const report = await fetchCorosRuns(folder, quoted, { download: coros.download, today: TODAY });
    expect(report).toEqual({ missing: 2, files: ['fit/r3_aa.fit', 'fit/r2_bb.fit'], stopped: null });
    // A list that says 4 activities but gives 3: what was read is fetched, the day stays, the runner is told.
    const other = await makeDataFolder([]);
    const short: CallTool = async (name, args) => (name === 'querySportRecords' ? { text: RECORDS.replace('(3 records)', '(4 records)'), isError: false } : coros.call(name, args));
    const shortReport = await fetchCorosRuns(other, short, { download: coros.download, today: TODAY });
    expect(shortReport.files).toHaveLength(2);
    expect(shortReport.stopped).toBe('IsoStride read 3 of the 4 activities COROS listed.');
    expect((await readCorosRecord(other)).since).toBeUndefined();
  });

  it('A run the folder already holds not downloaded again', async () => {
    // Exported by hand before: the same start (to 2 s) is the same run, kept as fetched without a file of the day's 50.
    const folder = await makeDataFolder([FILES.pace4]);
    await importFolder(folder);
    const held = (await readJson<RunsIndex>(folder, PATHS.runsIndex))!.runs[0];
    const start = Date.parse(held.startTime) / 1000;
    const list = `Sport Records — 2026-11-01 to 2026-11-24 (1 records)\n\n1. Outdoor Run — 2026-11-09\n   Time Window: startTimestamp=${start + 1} | endTimestamp=${start + 2600}\n   LabelId: 300000000000000001 | SportType: 100`;
    const asked: string[] = [];
    const call: CallTool = async (name) => { asked.push(name); return { text: JSON.stringify(list), isError: false }; };
    const report = await fetchCorosRuns(folder, call, { today: TODAY });
    expect(report).toEqual({ missing: 0, files: [], stopped: null });
    expect(asked).toEqual(['querySportRecords']);
    expect((await readCorosRecord(folder)).fetched).toEqual({ '300000000000000001': held.file });
  });
});

