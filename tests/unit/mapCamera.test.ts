import { describe, expect, it } from 'vitest';
import { MAX_MAP_ZOOM, fitCamera, panCamera, project, trimStanding, visibleRange, zoomCamera, type RoutePoint } from '@/components/mapCamera';

const SIZE = 320;
// A straight route due east along the equator, 1 point a second over 600 s.
const route: RoutePoint[] = Array.from({ length: 601 }, (_, t) => [0, t * 0.00005, t]);

describe('Map zoomed and panned', () => {
  it('Map camera follows the route', () => {
    // Fitted: the whole route in view, inside the padding.
    const cam = fitCamera(route, SIZE, 20);
    const [x0] = project(cam, SIZE, 0, 0);
    const [x1] = project(cam, SIZE, 0, 600 * 0.00005);
    expect(x0).toBeGreaterThanOrEqual(19.5);
    expect(x1).toBeLessThanOrEqual(SIZE - 19.5);
    expect(visibleRange(route, cam, SIZE)).toBeNull();
    // Zoomed in twice around the start: the start keeps its place, the chart's range is near the start.
    const near = zoomCamera(cam, 0.25, x0, SIZE / 2, SIZE);
    expect(near.z).toBeCloseTo(cam.z + 2);
    expect(project(near, SIZE, 0, 0)[0]).toBeCloseTo(x0);
    const range = visibleRange(route, near, SIZE)!;
    expect(range.from).toBe(0);
    expect(range.to).toBeLessThan(250);
    // Panned left by half the map: the range moves on along the route.
    const moved = visibleRange(route, panCamera(near, -SIZE / 2, 0), SIZE)!;
    expect(moved.from).toBeGreaterThan(range.from);
    expect(moved.to).toBeGreaterThan(range.to);
    // Out of the route entirely: no range; zoom is kept within its levels.
    expect(visibleRange(route, panCamera(near, 0, SIZE * 3), SIZE)).toBeNull();
    expect(zoomCamera(cam, 2 ** -40, 0, 0, SIZE).z).toBe(MAX_MAP_ZOOM);
    // Out and back the same way: zoomed in over the start, the start and the finish are both in view,
    // and the chart shows only the stretch under the pointer, the way out.
    const outBack: RoutePoint[] = [...route, ...route.slice(0, -1).reverse().map((p, i): RoutePoint => [0.0001, p[1], 601 + i])];
    const fit2 = fitCamera(outBack, SIZE, 20);
    const [sx, sy] = project(fit2, SIZE, 0, 0);
    const zoomed = zoomCamera(fit2, 0.25, sx, sy, SIZE);
    const out = visibleRange(outBack, zoomed, SIZE, [sx, sy])!;
    expect(out.from).toBe(0);
    expect(out.to).toBeLessThan(600);
    // Anchored on the way back instead: the stretch back.
    const [bx, by] = project(zoomed, SIZE, 0.0001, 0.0005);
    expect(visibleRange(outBack, zoomed, SIZE, [bx, by])!.from).toBeGreaterThan(600);
    // Standing at the start or the end of a stretch (60 s still, GPS drift under a metre) is left out;
    // a stop inside it stays.
    const still = (from: number, n: number, lon: number): RoutePoint[] => Array.from({ length: n }, (_, i) => [0, lon + (i % 2) * 0.000002, from + i]);
    const run = (from: number, n: number, lon: number): RoutePoint[] => Array.from({ length: n }, (_, i) => [0, lon + i * 0.00005, from + i]);
    const stretch = [...still(0, 60, 0), ...run(60, 100, 0), ...still(160, 30, 0.005), ...run(190, 100, 0.005), ...still(290, 60, 0.01)];
    expect(trimStanding(stretch, 0, stretch.length - 1)).toEqual({ from: 60, to: 290 });
    expect(trimStanding(still(0, 10, 0), 0, 9)).toEqual({ from: 9, to: 9 });
    // A single point fits at the highest fitted zoom.
    expect(fitCamera([[52, 21, 0]], SIZE, 20).z).toBe(17);
  });
});
