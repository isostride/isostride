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
}

/** The activities in querySportRecords' answer ("1. Outdoor Run — 2026-11-23 … LabelId: 4819… | SportType: 100"). */
export function readSportRecords(text: string): CorosActivity[] {
  const out: CorosActivity[] = [];
  for (const block of text.split(/\n(?=\s*\d+\.\s)/)) {
    const id = block.match(/LabelId:\s*(\d+)\s*\|\s*SportType:\s*(\d+)/i);
    if (!id) continue;
    out.push({ labelId: id[1], sportType: Number(id[2]), date: block.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null });
  }
  return out;
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
