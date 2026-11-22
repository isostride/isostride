/** m:ss of a time into a run. */
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** The Run screen of a run, with a stretch [from, to] s selected when given. */
export const runHref = (id: string, from?: number, to?: number) => `/run?id=${id}${from !== undefined && to !== undefined ? `&from=${Math.round(from)}&to=${Math.round(to)}` : ''}`;
