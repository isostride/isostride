import type { RunsIndex } from '@/lib/kernel';
import { PATHS, listFitFiles, type DataFolder } from './folder';

/**
 * The diagnostics of this device (the runner's "isostride dziala tam bardzo wolno", on a fast Android
 * phone where the browser's tools could not be reached): how long the folder takes to list and its
 * files to read and parse, measured here, for the runner to copy and send. A fresh folder (no texts
 * kept) is read first, the same one again after, so the reading kept shows too.
 */
export interface DiagnosticStep {
  /** what was measured, in English: the text is sent as it is */
  what: string;
  ms: number;
  detail?: string;
}

const kb = (text: string | null) => (text === null ? 'missing' : `${Math.round(text.length / 1024)} KB`); // i18n-ignore: the report is sent as it is, in English

/** Measures the folder's reads; `fresh` gives the folder anew, with nothing kept from reads before. */
export async function diagnose(fresh: () => DataFolder, now: () => number = () => performance.now()): Promise<DiagnosticStep[]> {
  const steps: DiagnosticStep[] = [];
  const time = async <T>(what: string, f: () => Promise<T>, detail?: (v: T) => string): Promise<T> => {
    const t0 = now();
    const v = await f();
    steps.push({ what, ms: Math.round(now() - t0), ...(detail ? { detail: detail(v) } : {}) });
    return v;
  };
  const folder = fresh();
  await time('list the folder', () => folder.list(''), (e) => `${e.length} entries`); // i18n-ignore: the report is sent as it is, in English
  const fits = await time('list its FIT files', () => listFitFiles(folder), (f) => `${f.length} files`); // i18n-ignore: the report is sent as it is, in English
  const indexText = await time('read runs-index.json (first time)', () => folder.readText(PATHS.runsIndex), kb);
  const index = await time('parse runs-index.json', async () => (indexText ? (JSON.parse(indexText) as RunsIndex) : null), (i) => `${i?.runs.length ?? 0} runs`); // i18n-ignore: the report is sent as it is, in English
  await time('read runs-index.json (again)', () => folder.readText(PATHS.runsIndex), kb);
  await time('read settings.json', () => folder.readText(PATHS.settings), kb);
  await time('read block-instances.json', () => folder.readText(PATHS.blockInstances), kb);
  const ids = (index?.runs ?? []).slice(-5).map((r) => r.id).reverse();
  if (ids.length) {
    const text = await time('read the last run file', () => folder.readText(PATHS.runFile(ids[0])), kb);
    await time('parse the last run file', async () => (text ? JSON.parse(text) : null));
    await time(`read ${ids.length} run files one after another`, async () => {
      for (const id of ids) await fresh().readText(PATHS.runFile(id));
      return ids.length;
    });
  }
  if (fits.length) await time('read a FIT file', () => folder.readBytes(fits[fits.length - 1]), (b) => `${Math.round(b.length / 1024)} KB`); // i18n-ignore: the report is sent as it is, in English
  // The average of a run file read is only known once timed: written again with it.
  const many = steps.find((s) => s.what.startsWith('read ') && s.what.endsWith('one after another'));
  if (many) many.detail = `${Math.round(many.ms / ids.length)} ms each`;
  return steps;
}

/** The steps as lines to copy: what, how long, what was found. */
export function diagnosticText(steps: DiagnosticStep[]): string {
  return steps.map((s) => `${s.what}: ${s.ms} ms${s.detail ? ` (${s.detail})` : ''}`).join('\n');
}
