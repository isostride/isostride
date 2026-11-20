import { describe, expect, it } from 'vitest';
import { backTarget, recordAddress, type TrailStore } from '@/components/screenTrail';

const store = (): TrailStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};

describe('Back to the previous screen', () => {
  it('Back link chosen from the trail', () => {
    // No screen before: back to Runs.
    const s = store();
    expect(backTarget(s)).toEqual({ href: '/', label: 'Runs', viaHistory: false });
    // Runs, then Analysis whose link changes as it is used, then a run: back to Analysis as it was left, through the history.
    recordAddress(s, '/', null);
    recordAddress(s, '/analysis', '/');
    recordAddress(s, '/analysis?items=b1&tab=segments', '/analysis');
    recordAddress(s, '/run?id=r1', '/analysis?items=b1&tab=segments');
    expect(backTarget(s)).toEqual({ href: '/analysis?items=b1&tab=segments', label: 'Analysis', viaHistory: true });
    // The run's own link changing (its view in the address) changes nothing.
    recordAddress(s, '/run?id=r1&from=60&to=600', '/run?id=r1');
    expect(backTarget(s)).toEqual({ href: '/analysis?items=b1&tab=segments', label: 'Analysis', viaHistory: true });
    // A second run opened from the first: still back to Analysis, by its link (the page right behind is the first run).
    recordAddress(s, '/run?id=r2', '/run?id=r1&from=60&to=600');
    expect(backTarget(s)).toEqual({ href: '/analysis?items=b1&tab=segments', label: 'Analysis', viaHistory: false });
    // From the calendar with a search: back to it, named Runs.
    recordAddress(s, '/?q=tempo', '/run?id=r2');
    recordAddress(s, '/run?id=r3', '/?q=tempo');
    expect(backTarget(s)).toEqual({ href: '/?q=tempo', label: 'Runs', viaHistory: true });
    // A screen that only redirects is not a place to go back to.
    recordAddress(s, '/blocks', '/run?id=r3');
    expect(backTarget(s).href).toBe('/?q=tempo');
    // Storage that fails: back to Runs.
    const broken: TrailStore = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    recordAddress(broken, '/analysis', null);
    expect(backTarget(broken)).toEqual({ href: '/', label: 'Runs', viaHistory: false });
  });
});
