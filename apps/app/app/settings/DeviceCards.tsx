'use client';

import { useChartSettings, useMapTiles, useNarrowMenu, useTheme, type ChartSettings, type Theme } from '@/lib/client';
import { APP_BUILT, APP_COMMIT, APP_VERSION, versionLabel } from '@/lib/kernel';

/** A setting of a choice among a few: its name and what it does on the left, the choice on the right. */
function Choice<T extends string | boolean>({ name, hint, label, value, options, onChange }: { name: string; hint: string; label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="display-row">
      <div>
        <div className="display-name">{name}</div>
        <div className="muted small">{hint}</div>
      </div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

/**
 * How the run's chart draws (the runner's request of 21 Nov 2026: "ustawienia z charts przenies do
 * settings - charts"): its lines, their smoothing, its x axis, the kept blocks drawn on it. Kept in
 * this browser; every chart follows a change at once.
 */
export function ChartsCard() {
  const [chart, setChart] = useChartSettings();
  const set = <K extends keyof ChartSettings>(k: K) => (v: ChartSettings[K]) => setChart({ [k]: v } as Partial<ChartSettings>);
  return (
    <section className="card display-card" aria-label="Charts">
      <div className="settings-head"><div><h2>Charts</h2><p className="muted small">How the chart of a run draws. Kept in this browser; a run&apos;s chart follows a change at once.</p></div></div>
      <Choice name="Lines" hint="Each metric in its own band, top to bottom, or all over the whole height on one another." label="Lines" value={chart.layout} options={[['bands', 'Bands'], ['overlay', 'Overlaid']]} onChange={set('layout')} />
      <Choice name="Line" hint="Smooth: a rolling mean whose width follows the zoom. Raw: the 10 s windows as they are." label="Smoothing" value={chart.smooth} options={[[true, 'Smooth'], [false, 'Raw']]} onChange={set('smooth')} />
      <Choice name="X axis" hint="By time, the distance under each tick; by distance, the time under each (a run without distance stays by time)." label="X axis" value={chart.axis} options={[['time', 'Time'], ['distance', 'Distance']]} onChange={set('axis')} />
      <div className="display-row">
        <label htmlFor="chart-blocks">
          <div className="display-name">Segments on the chart</div>
          <div className="muted small">Draw the efforts of every segment in the run; off, only the one pointed at in the chart menu.</div>
        </label>
        <input id="chart-blocks" type="checkbox" className="switch" checked={chart.blocks} onChange={(e) => setChart({ blocks: e.target.checked })} />
      </div>
    </section>
  );
}

/**
 * How the app looks and what it may fetch (the runner's request of 21 Nov 2026: "ustawienia schema
 * - light/dark i online/offline przenies do settings"): the theme, and the map background from the
 * network. Kept in this browser, not in the data folder: they belong to the device, not the runs.
 */
export function DisplayCard() {
  const [theme, setTheme] = useTheme();
  const [mapTiles, setMapTiles] = useMapTiles();
  const [narrow, setNarrow] = useNarrowMenu();
  return (
    <section className="card display-card" aria-label="Display">
      <div className="settings-head"><div><h2>Display</h2><p className="muted small">Kept in this browser: they belong to the device, not to the data folder.</p></div></div>
      <div className="display-row">
        <div>
          <div className="display-name">Theme</div>
          <div className="muted small">Light, dark, or as the system is set.</div>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['light', 'dark', 'system'] as Theme[]).map((t) => (
            <button key={t} type="button" className={theme === t ? 'on' : ''} onClick={() => setTheme(t)} role="radio" aria-checked={theme === t}>
              {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
            </button>
          ))}
        </div>
      </div>
      <div className="display-row">
        <label htmlFor="map-tiles">
          <div className="display-name">Map background <span className="muted">(online)</span></div>
          <div className="muted small">Map tiles from the OpenStreetMap server under a run&apos;s route. The server learns the area of the route shown; off, nothing leaves this device.</div>
        </label>
        <input id="map-tiles" type="checkbox" className="switch" checked={mapTiles} onChange={(e) => setMapTiles(e.target.checked)} />
      </div>
      <div className="display-row display-wide">
        <label htmlFor="narrow-menu">
          <div className="display-name">Narrow side menu</div>
          <div className="muted small">On a wide screen, the side menu shows its icons only.</div>
        </label>
        <input id="narrow-menu" type="checkbox" className="switch" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} />
      </div>
    </section>
  );
}


/** The repository of IsoStride, its commits and its changelog. */
const REPO = 'https://github.com/isostride/isostride';

/**
 * About the app (requirement "App version shown"): its version, the commit and the date of its build,
 * and the changelog of its versions.
 */
export function AboutCard() {
  return (
    <section className="card display-card" aria-label="About IsoStride">
      <div className="settings-head"><div><h2>About IsoStride</h2><p className="muted small">The version of the app in this browser; the files it writes to the data folder record it too.</p></div></div>
      <div className="display-row">
        <div>
          <div className="display-name">Version {versionLabel(APP_VERSION)}</div>
          <div className="muted small">
            {APP_VERSION}
            {APP_COMMIT && <> · commit <a href={`${REPO}/commit/${APP_COMMIT}`}><code>{APP_COMMIT}</code></a></>}
            {APP_BUILT && <> · built {APP_BUILT}</>}
          </div>
        </div>
        <a className="btn" href={`${REPO}/blob/master/CHANGELOG.md`}>Changelog</a>
      </div>
    </section>
  );
}
