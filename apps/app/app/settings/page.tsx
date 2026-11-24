'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { runInWorker, useLocale, useOpenFolder } from '@/lib/client';
import { msg, number, t } from '@/lib/i18n';
import dynamic from 'next/dynamic';
import { GearTags } from './GearTags';
import { AboutCard, ChartsCard, DisplayCard } from './DeviceCards';
import { METRICS_CHANGED, useMetrics } from '@/components';
import { metricInfo } from '@/lib/kernel';

/** The thresholds of the models' checks: loaded with their tab. */
const ModelsCard = dynamic(() => import('./ModelsCard').then((m) => m.ModelsCard), { ssr: false });
import { DEFAULT_ZONES, zoneMetricsOf, formatBoundaries, parseBoundaries, readSettings, writeSettings, zoneRanges, zoneTint, zonesFromMaxHr, type ZoneMetric } from '@/lib/settings';

/** The values of the models (heart rates, thresholds, time constants): loaded with the Models tab. */
const PerformanceCard = dynamic(() => import('../performance/PerformanceCard').then((m) => m.PerformanceCard), { ssr: false });

/** A value of a metric as the runner reads it: pace as m:ss, others as they are. */
const show = (m: ZoneMetric, v: number) => (m.pace ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : number(v));

/** The zones a metric's boundaries give, as chips: Z1 … Zn with their ranges. */
function ZoneChips({ m, boundaries }: { m: ZoneMetric; boundaries: number[] }) {
  const ranges = zoneRanges(m.key, boundaries);
  return (
    <div className="zone-chips" aria-label={t('{metric} zones', { metric: t(m.title) })}>
      {ranges.map((r, i) => {
        const text = r.lo === null ? `< ${show(m, r.hi!)}` : r.hi === null ? `≥ ${show(m, r.lo)}` : `${show(m, r.lo)}–${show(m, r.hi)}`;
        // A pace zone reads from the slow end: "> 5:30" rather than "≥ 5:30".
        const paceText = m.pace ? (r.hi === null ? `> ${show(m, r.lo!)}` : r.lo === null ? `≤ ${show(m, r.hi)}` : `${show(m, r.hi)}–${show(m, r.lo)}`) : text;
        return (
          <span key={i} className="zone-chip" style={{ background: zoneTint(i, ranges.length, 30) }}>
            <b>Z{i + 1}</b> {paceText}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The Settings tabs (requirement "Settings in tabs"), kept in the link (tab=metrics, gears, tags,
 * display, about; Models first: "w settings - tab models daj jako pierwsze"; About a tab of its own:
 * "about to osobny tab"): the zones inside Metrics, as zones are of a metric; the charts inside
 * Display ("metrics (w srodku zones) ... gears ... tags ... displays (w srodku charts) i models").
 */
type Tab = 'metrics' | 'gears' | 'tags' | 'display' | 'models' | 'about';
const TABS: [Tab, string][] = [['models', 'Models'], ['metrics', 'Metrics'], ['gears', 'Gears'], ['tags', 'Tags'], ['display', 'Display'], ['about', 'About']];
/** A tab's name in the language in use (TABS keeps the English as plain text: the test of the links reads it there). */
const tabName = (tab: Tab): string => ({ models: t('Models'), metrics: t('Metrics'), gears: t('Gears'), tags: t('Tags'), display: t('Display'), about: t('About') })[tab];
/** The tabs of links made before (tab=zones, gear, charts): the tab that holds them now. */
const MOVED: Record<string, Tab> = { zones: 'metrics', gear: 'gears', charts: 'display' };

export default function SettingsPageWrapper() {
  // Drawn again in the language chosen in Display, at once, the tab shown kept (requirement "Language chosen").
  useLocale();
  return <Suspense fallback={<div className="page wide-page"><div className="page-head"><h1>{t('Settings')}</h1></div></div>}><SettingsPage /></Suspense>;
}

/** Settings: the zones of the metrics, the gear, the tags and the display, one tab at a time. */
function SettingsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tabParam = params.get('tab');
  const asked = tabParam ? MOVED[tabParam] ?? tabParam : null;
  const tab: Tab = TABS.some(([key]) => key === asked) ? (asked as Tab) : 'models';
  const [performanceDrawn, setPerformanceDrawn] = useState(false);
  const onPerformanceDrawn = useCallback(() => setPerformanceDrawn(true), []);
  const setTab = (next: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (next === 'models') q.delete('tab'); else q.set('tab', next);
    router.replace(`/settings${q.toString() ? `?${q.toString()}` : ''}`);
  };
  return (
    <div className="page wide-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t('Your settings, kept in your data folder')}</div>
          <h1>{t('Settings')}</h1>
        </div>
        <span className="spacer" />
        <Link className="btn" href="/setup" title={t('The runs, your heart rate, the zones and the load model, step by step')}>{t('Setup wizard')}</Link>
      </div>
      <div className="tabs page-tabs" role="tablist" aria-label={t('Settings sections')}>
        {TABS.map(([key]) => (
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-controls={tab === key ? `panel-${key}` : undefined} aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{tabName(key)}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'metrics' && <MetricsCard />}
        {tab === 'gears' && <GearTags part="gear" />}
        {tab === 'tags' && <GearTags part="tags" />}
        {/* The thresholds' card below the load model's once that is drawn, so it is not pushed down (layout shift 0). */}
        {tab === 'models' && <section className="models-tab" aria-label={t('Models')}><PerformanceCard onReady={onPerformanceDrawn} />{performanceDrawn && <ModelsCard />}</section>}
        {tab === 'display' && <div className="models-tab"><DisplayCard /><ChartsCard /></div>}
        {tab === 'about' && <AboutCard />}
      </div>
    </div>
  );
}

/** The words of a metric's direction. */
const WORDS = { higher: msg('Higher is better'), lower: msg('Lower is better'), neutral: msg('Neither (up or down)') } as const;

/**
 * The folder's metrics in one table ("settings metrics - polacz obie tabele nie che tam 2-och"), kept
 * in user/settings.json: for each, its zones (coloured on the run chart; saved with Save) and which way
 * is better (requirement "Metric direction set by the runner": the app's own for the metrics it knows,
 * none for the others until the runner sets it; saved at once). Verdicts word a change as better or
 * worse only in a direction known or set.
 */
function MetricsCard() {
  const { folder, handle } = useOpenFolder();
  // Every metric of the folder's runs (requirement "Every metric offered everywhere").
  const { catalog, blockKeys } = useMetrics();
  const ZONE_METRICS = zoneMetricsOf(catalog);
  /** the rows: the metrics with zones in their order, then those compared only */
  const rows = [...ZONE_METRICS.map((m) => m.key), ...blockKeys.filter((k) => !ZONE_METRICS.some((m) => m.key === k))];
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [maxHr, setMaxHr] = useState('');
  /** the state of the saving, as a key shown with t() */
  const [status, setStatus] = useState<string | null>(null);
  /** no settings saved yet: the default zones apply */
  const [defaults, setDefaults] = useState(false);
  /** which way is better, as chosen and not saved yet */
  const [dirs, setDirs] = useState<Record<string, 'higher' | 'lower'>>({});
  /** what is saved, to tell a change not saved yet (only then are there Save and Cancel) and to go back to */
  const [base, setBase] = useState<{ texts: Record<string, string>; dirs: Record<string, 'higher' | 'lower'> } | null>(null);
  const textsOf = (zones: Record<string, number[]>) => Object.fromEntries([...new Set([...ZONE_METRICS.map((m) => m.key), ...Object.keys(zones)])].map((k) => [k, formatBoundaries(k, zones[k] ?? [])]));
  const fill = (zones: Record<string, number[]>) => setTexts(textsOf(zones));

  // Filled once the settings and the folder's metrics are both read, and drawn only then, whole: its
  // note on the defaults, its rows and its Save do not come one after the other (layout shift 0).
  const known = useMetrics();
  useEffect(() => {
    if (!known.ready) return;
    readSettings(folder).then((s) => {
      const zoneTexts = textsOf(s.zones);
      const d = { ...(s.directions ?? {}) } as Record<string, 'higher' | 'lower'>;
      setTexts(zoneTexts); setDirs(d); setBase({ texts: zoneTexts, dirs: d }); setDefaults(!!s.defaults);
    });
  }, [folder, known.ready]);
  const zonesOf = (z: Record<string, string>) => JSON.stringify(Object.fromEntries(ZONE_METRICS.map((m) => [m.key, z[m.key] ?? ''])));
  const dirsOf = (d: Record<string, string>) => JSON.stringify(Object.entries(d).sort());
  const dirty = base !== null && (zonesOf(texts) !== zonesOf(base.texts) || dirsOf(dirs) !== dirsOf(base.dirs));
  /** the changes not saved left: the table as saved */
  const discard = () => { if (base) { setTexts(base.texts); setDirs(base.dirs); setStatus(null); } };

  const parsed = Object.fromEntries(ZONE_METRICS.map((m) => [m.key, parseBoundaries(m.key, texts[m.key] ?? '')]));
  const invalid = ZONE_METRICS.filter((m) => parsed[m.key] === null);
  const edit = (key: string, text: string) => { setTexts((z) => ({ ...z, [key]: text })); setStatus(null); };
  const save = async () => {
    if (invalid.length) return;
    const before = await readSettings(folder);
    // The zones of metrics this folder does not hold stay as they were.
    const kept = before.defaults ? {} : before.zones;
    await writeSettings(folder, { schemaVersion: 1, zones: { ...kept, ...Object.fromEntries(ZONE_METRICS.map((m) => [m.key, parsed[m.key] ?? []])) }, performance: before.performance, directions: dirs });
    setDefaults(false);
    const directionsChanged = base !== null && dirsOf(dirs) !== dirsOf(base.dirs);
    setBase({ texts, dirs });
    if (directionsChanged) window.dispatchEvent(new Event(METRICS_CHANGED));
    // Edwards' TRIMP counts the heart rate zones: the loads follow them.
    if (before.performance.load === 'trimpEdwards') { setStatus(msg('Recomputing the loads…')); await runInWorker('context', handle); }
    setStatus(msg('Saved'));
  };
  const max = Number(maxHr);
  /** Which way is better chosen: kept with the zones until Save. */
  const choose = (key: string, choice: 'app' | 'higher' | 'lower') => {
    setDirs((d) => { const next = { ...d }; if (choice === 'app') delete next[key]; else next[key] = choice; return next; });
    setStatus(null);
  };

  if (base === null) return null;
  return (
    <section className="card settings-zones" aria-label={t('Metrics')}>
      <div className="settings-head">
        <div>
          <h2>{t('Metrics')}</h2>
          <p className="muted small">{t('Every metric your files hold, with its unit as the file gives it. Its zones: the boundaries between them, separated by commas, Z1 the easiest, pace as m:ss per km; the ')}<Link href="/">{t('run chart')}</Link>{t(' colours them. Which way is better: Compare words a change as better or worse only where this is known; otherwise it says only higher or lower.')}</p>
        </div>
        <span className="spacer" />
        {status && <span className="muted small" role="status">{t(status)}</span>}
        <button className="btn" onClick={() => { fill(DEFAULT_ZONES); setStatus(null); }}>{t('Default zones')}</button>
        {dirty && <button className="btn" onClick={discard}>{t('Cancel')}</button>}
        {dirty && <button className="btn primary" disabled={invalid.length > 0} onClick={save}>{t('Save')}</button>}
      </div>
      {defaults && <div className="zone-defaults small">{t('These are the default zones, for trying the app: heart rate at 60–90 % of a maximum of 190 bpm, and common pace and cadence zones. Change them to yours and save.')}</div>}
      <div className="zone-rows">
        <div className="zone-row zone-head muted small" aria-hidden="true"><span>{t('Metric')}</span><span>{t('Zones')}</span><span /><span>{t('Which way is better')}</span></div>
        {rows.map((key) => {
          const info = metricInfo(key, catalog);
          const m = ZONE_METRICS.find((z) => z.key === key);
          const b = m ? parsed[m.key] : undefined;
          const own = info.direction;
          const direction = blockKeys.includes(key) && (
            <select className="select small" aria-label={t('Which way is better for {metric}', { metric: t(info.name) })} value={dirs[key] ?? 'app'} onChange={(e) => choose(key, e.target.value as 'app' | 'higher' | 'lower')}>
              <option value="app">{own === 'neutral' ? t('Not set: up or down') : t('As the app has it: {direction}', { direction: t(WORDS[own]).toLowerCase() })}</option>
              <option value="higher">{t(WORDS.higher)}</option>
              <option value="lower">{t(WORDS.lower)}</option>
            </select>
          );
          const name = <>{t(info.name)}{info.unit ? <span className="muted"> · {t(info.unit)}</span> : null}{info.origin === 'developer' ? <span className="chip small">{t('app field')}</span> : null}</>;
          if (!m) return (
            <div key={key} className="zone-row">
              <span className="zone-name">{name}</span>
              <span className="muted small">{t('No zones')}</span>
              <span />
              <div className="zone-direction">{direction}</div>
            </div>
          );
          return (
            <div key={m.key} className="zone-row">
              <label className="zone-name" htmlFor={`z-${m.key}`}>{name}</label>
              <div className="zone-edit">
                <input id={`z-${m.key}`} className="input" value={texts[m.key] ?? ''} placeholder={m.pace ? t('e.g. 6:00, 5:20, 4:50, 4:20') : m.key === 'heartRate' ? t('e.g. 120, 140, 155, 170') : t('no zones')}
                  aria-invalid={b === null} onChange={(e) => edit(m.key, e.target.value)} />
                {m.key === 'heartRate' && (
                  <span className="zone-max">
                    <input className="input" inputMode="numeric" aria-label={t('Max heart rate')} placeholder={t('max HR')} value={maxHr} onChange={(e) => setMaxHr(e.target.value)} />
                    <button className="btn sm" disabled={!(max > 100 && max < 250)} onClick={() => edit(m.key, formatBoundaries(m.key, zonesFromMaxHr(max)))}>{t('Fill from max HR')}</button>
                  </span>
                )}
              </div>
              <div className="zone-out">
                {b === null ? <span className="zone-err small">{m.pace ? t('Write each boundary as m:ss, e.g. 5:30.') : t('Write each boundary as a number.')}</span>
                  : b!.length ? <ZoneChips m={m} boundaries={b!} /> : <span className="muted small">{t('No zones')}</span>}
              </div>
              <div className="zone-direction">{direction}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
