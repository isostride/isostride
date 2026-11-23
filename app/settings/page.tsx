'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { runInWorker, useOpenFolder } from '@/lib/client';
import dynamic from 'next/dynamic';
import { GearTags } from './GearTags';
import { ChartsCard, DisplayCard } from './DeviceCards';

/** The thresholds of the models' checks: loaded with their tab. */
const ModelsCard = dynamic(() => import('./ModelsCard').then((m) => m.ModelsCard), { ssr: false });
import { DEFAULT_ZONES, ZONE_METRICS, formatBoundaries, parseBoundaries, readSettings, writeSettings, zoneRanges, zoneShade, zonesFromMaxHr, type ZoneMetric } from '@/lib/settings';

/** The values of the models (heart rates, thresholds, time constants): loaded with the Models tab. */
const PerformanceCard = dynamic(() => import('../performance/PerformanceCard').then((m) => m.PerformanceCard), { ssr: false });

/** A value of a metric as the runner reads it: pace as m:ss, others as they are. */
const show = (m: ZoneMetric, v: number) => (m.pace ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : String(v));

/** The zones a metric's boundaries give, as chips: Z1 … Zn with their ranges. */
function ZoneChips({ m, boundaries }: { m: ZoneMetric; boundaries: number[] }) {
  const ranges = zoneRanges(m.key, boundaries);
  return (
    <div className="zone-chips" aria-label={`${m.title} zones`}>
      {ranges.map((r, i) => {
        const text = r.lo === null ? `< ${show(m, r.hi!)}` : r.hi === null ? `≥ ${show(m, r.lo)}` : `${show(m, r.lo)}–${show(m, r.hi)}`;
        // A pace zone reads from the slow end: "> 5:30" rather than "≥ 5:30".
        const paceText = m.pace ? (r.hi === null ? `> ${show(m, r.lo!)}` : r.lo === null ? `≤ ${show(m, r.hi)}` : `${show(m, r.hi)}–${show(m, r.lo)}`) : text;
        return (
          <span key={i} className="zone-chip" style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(zoneShade(i, ranges.length) * 140)}%, var(--surface))` }}>
            <b>Z{i + 1}</b> {paceText}
          </span>
        );
      })}
    </div>
  );
}

/** The Settings tabs (requirement "Settings in tabs"), kept in the link (tab=zones, gear, tags, charts, display). */
type Tab = 'zones' | 'gear' | 'tags' | 'charts' | 'models' | 'display';
const TABS: [Tab, string][] = [['zones', 'Zones'], ['gear', 'Gear'], ['tags', 'Tags'], ['charts', 'Charts'], ['models', 'Models'], ['display', 'Display']];

export default function SettingsPageWrapper() {
  return <Suspense fallback={<div className="page wide-page"><div className="page-head"><h1>Settings</h1></div></div>}><SettingsPage /></Suspense>;
}

/** Settings: the zones of the metrics, the gear, the tags and the display, one tab at a time. */
function SettingsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tabParam = params.get('tab');
  const tab: Tab = TABS.some(([t]) => t === tabParam) ? (tabParam as Tab) : 'zones';
  const setTab = (t: Tab) => {
    const q = new URLSearchParams(params.toString());
    if (t === 'zones') q.delete('tab'); else q.set('tab', t);
    router.replace(`/settings${q.toString() ? `?${q.toString()}` : ''}`);
  };
  return (
    <div className="page wide-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your settings, kept in your data folder</div>
          <h1>Settings</h1>
        </div>
        <span className="spacer" />
        <Link className="btn" href="/setup" title="The runs, your heart rate, the zones and the load model, step by step">Setup wizard</Link>
      </div>
      <div className="tabs page-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(([t, name]) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls={tab === t ? `panel-${t}` : undefined} aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{name}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'zones' && <ZonesCard />}
        {(tab === 'gear' || tab === 'tags') && <GearTags part={tab} />}
        {tab === 'charts' && <ChartsCard />}
        {tab === 'models' && <section className="models-tab" aria-label="Models"><PerformanceCard /><ModelsCard /></section>}
        {tab === 'display' && <DisplayCard />}
      </div>
    </div>
  );
}

/** The zones of the metrics, kept in user/settings.json, coloured on the run chart. */
function ZonesCard() {
  const { folder, handle } = useOpenFolder();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [maxHr, setMaxHr] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  /** no settings saved yet: the default zones apply */
  const [defaults, setDefaults] = useState(false);
  /** what is saved, to tell a change not saved yet: only then is there a Save */
  const [saved, setSaved] = useState<string | null>(null);
  const textsOf = (zones: Record<string, number[]>) => Object.fromEntries(ZONE_METRICS.map((m) => [m.key, formatBoundaries(m.key, zones[m.key] ?? [])]));
  const fill = (zones: Record<string, number[]>) => setTexts(textsOf(zones));

  useEffect(() => {
    readSettings(folder).then((s) => { fill(s.zones); setSaved(JSON.stringify(textsOf(s.zones))); setDefaults(!!s.defaults); });
  }, [folder]);
  const dirty = saved !== null && JSON.stringify(Object.fromEntries(ZONE_METRICS.map((m) => [m.key, texts[m.key] ?? '']))) !== saved;

  const parsed = Object.fromEntries(ZONE_METRICS.map((m) => [m.key, parseBoundaries(m.key, texts[m.key] ?? '')]));
  const invalid = ZONE_METRICS.filter((m) => parsed[m.key] === null);
  const edit = (key: string, text: string) => { setTexts((t) => ({ ...t, [key]: text })); setStatus(null); };
  const save = async () => {
    if (invalid.length) return;
    const before = await readSettings(folder);
    await writeSettings(folder, { schemaVersion: 1, zones: Object.fromEntries(ZONE_METRICS.map((m) => [m.key, parsed[m.key] ?? []])), performance: before.performance });
    setDefaults(false);
    setSaved(JSON.stringify(Object.fromEntries(ZONE_METRICS.map((m) => [m.key, texts[m.key] ?? '']))));
    // Edwards' TRIMP counts the heart rate zones: the loads follow them.
    if (before.performance.load === 'trimpEdwards') { setStatus('Recomputing the loads…'); await runInWorker('context', handle); }
    setStatus('Saved');
  };
  const max = Number(maxHr);

  return (
    <section className="card settings-zones" aria-label="Zones">
      <div className="settings-head">
        <div>
          <h2>Zones</h2>
          <p className="muted small">The boundaries between the zones of a metric, separated by commas: Z1 is the easiest. Pace as m:ss per km. The <Link href="/">run chart</Link> colours the zones of the metrics it shows.</p>
        </div>
        <span className="spacer" />
        {status && <span className="muted small" role="status">{status}</span>}
        <button className="btn" onClick={() => { fill(DEFAULT_ZONES); setStatus(null); }}>Default zones</button>
        {dirty && <button className="btn primary" disabled={invalid.length > 0} onClick={save}>Save</button>}
      </div>
      {defaults && <div className="zone-defaults small">These are the default zones, for trying the app: heart rate at 60–90 % of a maximum of 190 bpm, and common pace and cadence zones. Change them to yours and save.</div>}
      <div className="zone-rows">
        {ZONE_METRICS.map((m) => {
          const b = parsed[m.key];
          return (
            <div key={m.key} className="zone-row">
              <label className="zone-name" htmlFor={`z-${m.key}`}>{m.title} <span className="muted">· {m.unit}</span></label>
              <div className="zone-edit">
                <input id={`z-${m.key}`} className="input" value={texts[m.key] ?? ''} placeholder={m.pace ? 'e.g. 6:00, 5:20, 4:50, 4:20' : m.key === 'heartRate' ? 'e.g. 120, 140, 155, 170' : 'no zones'}
                  aria-invalid={b === null} onChange={(e) => edit(m.key, e.target.value)} />
                {m.key === 'heartRate' && (
                  <span className="zone-max">
                    <input className="input" inputMode="numeric" aria-label="Max heart rate" placeholder="max HR" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} />
                    <button className="btn sm" disabled={!(max > 100 && max < 250)} onClick={() => edit(m.key, formatBoundaries(m.key, zonesFromMaxHr(max)))}>Fill from max HR</button>
                  </span>
                )}
              </div>
              <div className="zone-out">
                {b === null ? <span className="zone-err small">{m.pace ? 'Write each boundary as m:ss, e.g. 5:30.' : 'Write each boundary as a number.'}</span>
                  : b.length ? <ZoneChips m={m} boundaries={b} /> : <span className="muted small">No zones</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
