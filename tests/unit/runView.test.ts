import { describe, expect, it } from 'vitest';
import { mergeParams, viewFromParams, viewToParams, type RunView } from '@/components/runView';

const KEYS = new Set(['speed', 'heartRate', 'cadence', 'groundContactTime', 'power']);
const PREFS: RunView = { range: null, slots: ['speed', 'heartRate', 'cadence', 'groundContactTime'], focus: null, layout: 'bands', axis: 'time', smooth: true, blocks: false, map: null };

describe('Run view kept in its link', () => {
  it('View written and read from a link', () => {
    const view: RunView = { range: [120, 480], slots: ['speed', 'heartRate', null, 'cadence'], focus: 'heartRate', layout: 'overlay', axis: 'distance', smooth: false, blocks: true, map: { z: 16.25, cx: 36612345.5, cy: 21234567.25 } };
    const link = viewToParams('20261111-205800', view);
    expect(link.toString()).toBe('id=20261111-205800&from=120&to=480&m=speed%2CheartRate%2C_%2Ccadence&f=heartRate&l=overlay&x=distance&s=raw&b=1&map=16.250%2C36612345.5%2C21234567.3');
    const back = viewFromParams(new URLSearchParams(link.toString()), PREFS, KEYS);
    expect({ ...back, map: null }).toEqual({ ...view, map: null });
    expect(back.map!.z).toBe(16.25);
    expect(back.map!.cy).toBeCloseTo(21234567.25, 0);

    // A link holding only the range: the range from it, the rest from the run's memory, then the last choices.
    const memory = new URLSearchParams('id=r&from=10&to=20&l=overlay&f=cadence');
    const merged = mergeParams(new URLSearchParams('id=r&from=600&to=900'), memory);
    const read = viewFromParams(merged, PREFS, KEYS);
    expect(read.range).toEqual([600, 900]);
    expect(read.layout).toBe('overlay');
    expect(read.focus).toBe('cadence');
    expect(read.axis).toBe('time');
    expect(read.slots).toEqual(PREFS.slots);
    // Nothing in the link: all from the memory; no memory: the last choices.
    expect(viewFromParams(mergeParams(new URLSearchParams('id=r'), memory), PREFS, KEYS).range).toEqual([10, 20]);
    expect(viewFromParams(mergeParams(new URLSearchParams('id=r'), null), PREFS, KEYS)).toEqual(PREFS);

    // What does not read is left out: an unknown metric, a reversed range, a broken map, odd values.
    const odd = viewFromParams(new URLSearchParams('from=500&to=100&m=speed,nonsense,_,power&f=nonsense&l=sideways&x=km&s=maybe&b=2&map=1,2'), PREFS, KEYS);
    expect(odd.range).toBeNull();
    expect(odd.slots).toEqual(['speed', null, null, 'power']);
    expect(odd).toMatchObject({ focus: null, layout: 'bands', axis: 'time', smooth: true, blocks: false, map: null });
    expect(viewFromParams(new URLSearchParams('m=speed,heartRate'), PREFS, KEYS).slots).toEqual(PREFS.slots);
    expect(viewFromParams(new URLSearchParams('from=&to=5'), PREFS, KEYS).range).toBeNull();
  });
});
