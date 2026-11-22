import { describe, expect, it } from 'vitest';
import { analysisChanged, analysisQuery, defaultAnalysisName, removeAnalysis, upsertAnalysis } from '@/lib/compare';

const NOW = new Date('2026-11-22T12:00:00Z');

describe('Saved analyses', () => {
  it('Analysis saved, named, changed and deleted', () => {
    // The link kept without the saved analysis' own id or a one-off block link.
    expect(analysisQuery('items=b%3Ax%3A0&m=speed&a=an-1&def=x&tab=ab')).toBe('items=b%3Ax%3A0&m=speed&tab=ab');
    expect(defaultAnalysisName([])).toBe('Analysis');
    expect(defaultAnalysisName(['Promenade', ' ', 'Best 5 km'])).toBe('Promenade + Best 5 km');
    expect(defaultAnalysisName(['x'.repeat(80)])).toHaveLength(60);
    // A new one goes first; the same name again gets a number.
    let { list, saved } = upsertAnalysis([], { name: 'Tempo', query: 'items=b%3At%3A0' }, NOW);
    expect(saved).toMatchObject({ name: 'Tempo', query: 'items=b%3At%3A0', savedAt: NOW.toISOString() });
    const first = saved;
    ({ list, saved } = upsertAnalysis(list, { name: 'Tempo', query: 'items=r%3Ar1%3A0&a=x' }, NOW));
    expect(list.map((x) => x.name)).toEqual(['Tempo (2)', 'Tempo']);
    expect(saved.query).toBe('items=r%3Ar1%3A0');
    // Saved again in place: its own name is no clash, its link changes.
    ({ list } = upsertAnalysis(list, { id: first.id, name: 'Tempo', query: 'items=b%3At%3A0&m=heartRate' }, NOW));
    expect(list.map((x) => [x.name, x.query])).toEqual([['Tempo (2)', 'items=r%3Ar1%3A0'], ['Tempo', 'items=b%3At%3A0&m=heartRate']]);
    expect(upsertAnalysis(list, { name: '  ', query: '' }, NOW).saved.name).toBe('Analysis');
    // Something to save: a new analysis, or one whose link changed.
    expect(analysisChanged(null, 'items=x')).toBe(true);
    expect(analysisChanged(list[1], `items=b%3At%3A0&m=heartRate&a=${first.id}`)).toBe(false);
    expect(analysisChanged(list[1], 'items=b%3At%3A0&m=speed')).toBe(true);
    expect(removeAnalysis(list, first.id).map((x) => x.name)).toEqual(['Tempo (2)']);
  });
});
