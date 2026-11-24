'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RouteMap } from '@/components';
import { msg, number, t } from '@/lib/i18n';
import { zoneOf, zoneRanges, zoneStep } from '@/lib/settings';

/** A metric the route can be coloured by: its values per window of the run. */
export interface RouteMetric {
  key: string;
  title: string;
  format: (v: number) => string;
  /** the lower, the better (a pace): the ramp darkens as the value falls */
  invert?: boolean;
  /** a value per window, smoothed for drawing */
  values: (number | null)[];
  /** the boundaries of its zones in Settings (Z1 the easiest); none: it has no zones */
  zones?: number[];
}

/** The steps of the ramp, in its own tokens: two greens, a yellow, an orange, two reds ("zacznij od zielonego i przejdz do czerwonego", "2 zielone kolory chce"). */
const STEPS = 6;

/**
 * The map of a run made large (the runner's request of 21 Nov 2026: "tryb w ktorym podczas
 * przegladania biegu moge powiekszyc widok mapy ... moge wybrac 1 metryke ktora bedzie rysowana
 * na trasie i zmieniala kolor w zaleznosci od wartosci"; requirement "Route coloured by a metric"):
 * the route over the window's height, coloured by one metric chosen beside it from green, the low
 * end, to red, the high end (for a pace, red is fast): by the runner's zones in Settings ("chce
 * wartosci z settings"), Z1 green, or by six steps that each hold a sixth of this run ("teraz prawie
 * wszystko jest czerwone na skali"), with the ranges and shares, the metric's lowest, mean and highest. Esc or the close button returns to the run.
 */
export function RouteExpanded({ lat, lon, t: times, start, step, metrics, initial, onClose }: {
  lat: (number | null)[];
  lon: (number | null)[];
  t: number[];
  /** the start of the first window and the length of a window, s */
  start: number;
  step: number;
  metrics: RouteMetric[];
  initial: string;
  onClose: () => void;
}) {
  const [key, setKey] = useState(metrics.some((m) => m.key === initial) ? initial : metrics[0]?.key);
  /** the colours by the zones of Settings ("chce wartosci z settings") or by sixths of this run */
  const [by, setBy] = useState<'zones' | 'run'>('zones');
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const metric = metrics.find((m) => m.key === key) ?? metrics[0];
  const zones = metric?.zones?.length ? metric.zones : null;
  const byZones = by === 'zones' && zones !== null;

  // The scale of the metric: six steps that each hold a sixth of the run's values (quantiles), so a run
  // mostly at one pace still shows its changes; the legend gives each step's range.
  const scale = useMemo(() => {
    if (!metric) return null;
    const vs = metric.values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
    if (!vs.length) return null;
    const edges = Array.from({ length: STEPS + 1 }, (_, k) => vs[Math.round(((vs.length - 1) * k) / STEPS)]);
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    return { edges, min: vs[0], max: vs[vs.length - 1], mean, values: vs };
  }, [metric]);

  /** The step of a value: by its zone in Settings, or by the inner edges of the run it passes; 0 green, the low end; 5 dark red, the high end (for a pace, the fast end). */
  const stepOf = (v: number) => {
    if (byZones) return zoneStep(zoneOf(metric!.key, zones!, v), zones!.length + 1);
    if (!scale) return 0;
    let k = 0;
    while (k < STEPS - 1 && v > scale.edges[k + 1]) k++;
    return metric?.invert ? STEPS - 1 - k : k;
  };
  const colorAt = useMemo(() => {
    if (!metric || !scale) return null;
    return (time: number) => {
      const i = Math.floor((time - start) / step);
      const v = metric.values[Math.min(metric.values.length - 1, Math.max(0, i))];
      return v === null || v === undefined ? null : `var(--heat-${stepOf(v) + 1})`; // i18n-ignore: a colour
    };
    // stepOf follows metric, scale and the zones.
  }, [metric, scale, start, step, byZones, zones]);

  // The value under the pointer: the metric's, at the window of that time.
  const valueAt = useMemo(() => {
    if (!metric) return null;
    return (time: number) => {
      const v = metric.values[Math.min(metric.values.length - 1, Math.max(0, Math.floor((time - start) / step)))];
      return v === null || v === undefined ? null : `${metric.title} ${metric.format(v)}`;
    };
  }, [metric, start, step]);

  // The legend from red (the high end) to green: each step's range, in the metric's units, and its share of the run.
  const legend: { step: number; name?: string; label: string; share: number }[] = !scale ? [] : byZones
    ? zoneRanges(metric!.key, zones!).map((r, z) => {
      const n = scale.values.filter((v) => zoneOf(metric!.key, zones!, v) === z).length;
      // A zone takes its lower boundary (a pace: its upper one, the slower), as zoneOf counts them.
      const [below, above] = metric!.invert ? ['≤', '>'] : ['<', '≥'];
      const label = r.lo === null ? `${below} ${metric!.format(r.hi!)}` : r.hi === null ? `${above} ${metric!.format(r.lo)}` : `${metric!.format(r.lo)} – ${metric!.format(r.hi)}`;
      return { step: zoneStep(z, zones!.length + 1), name: `Z${z + 1}`, label, share: n / scale.values.length };
    }).reverse()
    : Array.from({ length: STEPS }, (_, k) => {
      const [a, b] = [scale.edges[k], scale.edges[k + 1]];
      const n = scale.values.filter((v) => (k === 0 ? v <= b : v > a && v <= b)).length;
      return { step: metric?.invert ? STEPS - 1 - k : k, label: `${metric!.format(Math.min(a, b))} – ${metric!.format(Math.max(a, b))}`, share: n / scale.values.length };
    }).filter((l) => l.share > 0).sort((x, y) => y.step - x.step);

  return (
    <div className="route-expanded-backdrop">
      <div className="route-expanded" role="dialog" aria-modal="true" aria-label={t('Map of the run')}>
        <div className="route-expanded-head">
          <h2>{t('Map')} <span className="muted">· {metric ? metric.title.toLowerCase() : t('the route')}</span></h2>
          <button ref={close} type="button" className="btn sm" onClick={onClose}>{t('Close')}</button>
        </div>
        <div className="route-expanded-map">
          <RouteMap lat={lat} lon={lon} t={times} cursor={null} size={640} colorAt={colorAt} valueAt={valueAt} follow={false} controls hint={t('Point at the route for its value · scroll or + − to zoom · drag to move')} />
        </div>
        <aside className="route-expanded-side">
          <div className="route-metric" role="radiogroup" aria-label={t('Colour the route by')}>
            {metrics.map((m) => (
              <button key={m.key} type="button" role="radio" aria-checked={m.key === key} className={`route-metric-option ${m.key === key ? 'on' : ''}`} onClick={() => setKey(m.key)}>{m.title}</button>
            ))}
          </div>
          {metric && scale ? (
            <>
              <dl className="route-figures form-figures" aria-label={t('{metric} of the run', { metric: metric.title })}>
                <div><dt>{t('Lowest')}</dt><dd className="tnum">{metric.format(scale.min)}</dd></div>
                <div><dt>{t('Mean')}</dt><dd className="tnum">{metric.format(scale.mean)}</dd></div>
                <div><dt>{t('Highest')}</dt><dd className="tnum">{metric.format(scale.max)}</dd></div>
              </dl>
              <div className="segmented route-by" role="radiogroup" aria-label={t('Colours by')}>
                {([['zones', msg('Zones from Settings')], ['run', msg('This run')]] as const).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={(k === 'zones') === byZones} className={(k === 'zones') === byZones ? 'on' : ''} disabled={k === 'zones' && !zones} onClick={() => setBy(k)}>{t(l)}</button>
                ))}
              </div>
              <div className="route-legend" role="list" aria-label={t('Colours of {metric}', { metric: metric.title.toLowerCase() })}>
                {legend.map((l) => (
                  <div key={l.name ?? l.step} role="listitem" className="route-legend-row">
                    <i style={{ background: `var(--heat-${l.step + 1})` }} aria-hidden="true" />
                    {l.name && <b className="route-zone">{l.name}</b>}
                    <span className="tnum">{l.label}</span>
                    <span className="muted tnum route-share">{number(Math.round(l.share * 100))} %</span>
                  </div>
                ))}
              </div>
              <p className="muted small">
                {byZones
                  ? <>{t('Your zones of {metric} in', { metric: metric.title.toLowerCase() })} <Link href="/settings">{t('Settings')}</Link>{t(', Z1 green; the share of the run in each beside it.')}</>
                  : <>{metric.invert ? t('Green slow, red fast') : t('Green low, red high')}{t('; each colour holds about a sixth of the run, the share beside its range.')}{!zones && <> {t('{metric} has no zones in', { metric: metric.title })} <Link href="/settings">{t('Settings')}</Link>.</>}</>}
              </p>
            </>
          ) : <p className="muted small">{t('This run has no values of it.')}</p>}
        </aside>
      </div>
    </div>
  );
}
