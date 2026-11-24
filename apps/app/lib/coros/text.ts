/**
 * The answers of COROS's tools are text written for a language model, not data (ADR "COROS through
 * its MCP server"): the activities and the FIT links are read out of it here, against the text as
 * COROS wrote it on 24 Nov 2026. A change of that text shows as runs not found, not as wrong files.
 */

/** An activity of the runner's COROS account. */
export interface CorosActivity {
  /** COROS's id of the activity */
  labelId: string;
  sportType: number;
  /** its day, yyyy-mm-dd, when the text gives it */
  date: string | null;
  /** its start, seconds since 1970, when the text gives it */
  start: number | null;
}

/** The activities in querySportRecords' answer ("1. Outdoor Run — 2026-11-23 … LabelId: 4819… | SportType: 100"). */
export function readSportRecords(text: string): CorosActivity[] {
  // Each activity by its LabelId line, its day the last one written before it: whatever the line
  // breaks (COROS sends this list as a quoted text, its breaks written out as \n: the runner's
  // "pobral mi tylko 1 plik" when the list was read line by line).
  const plain = unquoted(text);
  const out: CorosActivity[] = [];
  let from = 0;
  for (const m of plain.matchAll(/LabelId:\s*(\d+)\s*\|\s*SportType:\s*(\d+)/gi)) {
    const days = [...plain.slice(from, m.index).matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)];
    // The first day after the previous activity is this one's (its title line); the list's own range is before the first.
    const day = out.length ? days[0]?.[1] : days.at(-1)?.[1];
    const start = plain.slice(from, m.index).match(/startTimestamp=(\d+)/)?.[1];
    out.push({ labelId: m[1], sportType: Number(m[2]), date: day ?? null, start: start ? Number(start) : null });
    from = m.index! + m[0].length;
  }
  return out;
}

/** How many activities the list says it holds ("(26 records)"), or null when it does not say. */
export function recordsCounted(text: string): number | null {
  const n = unquoted(text).match(/\((\d+) records?\)/i);
  return n ? Number(n[1]) : null;
}

/** A text sent as a quoted JSON string ("Sport Records …\n…"), as it reads; another as it is. */
function unquoted(text: string): string {
  const t = text.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      const s = JSON.parse(t);
      if (typeof s === 'string') return s;
    } catch {
      // Not a JSON string after all: read as it is.
    }
  }
  return text;
}

/** A FIT file of COROS: its name and where to download it. */
export interface FitLink {
  name: string;
  url: string;
}

/** The FIT links in queryActivityFitFileDownloadUrls' answer ("1. 4819…_bf9b.fit\n   https://s3eu.coros.com/fit/…/4819…_bf9b.fit"). */
export function readFitLinks(text: string): FitLink[] {
  const out: FitLink[] = [];
  for (const m of text.matchAll(/https:\/\/[^\s"'<>]+?\.fit\b/gi)) {
    const url = m[0];
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    // A name that is a plain file name only: it is written into the runner's folder.
    if (/^[\w.-]+\.fit$/i.test(name) && !out.some((l) => l.url === url)) out.push({ name, url });
  }
  return out;
}

/** Whether bytes are a FIT file: ".FIT" at bytes 8–11 of its header. */
export const isFitFile = (bytes: Uint8Array): boolean => bytes.length > 12 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === '.FIT';
