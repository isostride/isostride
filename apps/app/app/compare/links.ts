import { minSec } from '@/lib/kernel';
/** m:ss of a time into a run. */
export const mmss = (sec: number) => minSec(sec);

/** The Run screen of a run, with a stretch [from, to] s selected when given. */
// i18n-ignore
export const runHref = (id: string, from?: number, to?: number) => `/run?id=${id}${from !== undefined && to !== undefined ? `&from=${Math.round(from)}&to=${Math.round(to)}` : ''}`;
