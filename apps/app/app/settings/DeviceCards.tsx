'use client';

import { Diagnostics } from './Diagnostics';
import { useChartSettings, useLanguage, useMapTiles, useNarrowMenu, useTheme, type ChartSettings, type Theme } from '@/lib/client';
import { LOCALES, t } from '@/lib/i18n';
import { APP_BUILT, APP_COMMIT, APP_VERSION, REPO_URL, releaseNotesUrl, versionLabel } from '@/lib/kernel';

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
export function ChartsCard({ compare = true }: { /** the switches of Compare's Over time charts too (Settings; not the setup wizard) */ compare?: boolean } = {}) {
  const [chart, setChart] = useChartSettings();
  const set = <K extends keyof ChartSettings>(k: K) => (v: ChartSettings[K]) => setChart({ [k]: v } as Partial<ChartSettings>);
  return (
    <section className="card display-card" aria-label={t('Charts')}>
      <div className="settings-head"><div><h2>{t('Charts')}</h2><p className="muted small">{t('How the chart of a run draws. Kept in this browser; a run’s chart follows a change at once.')}</p></div></div>
      <Choice name={t('Lines')} hint={t('Each metric in its own band, top to bottom, or all over the whole height on one another.')} label={t('Lines')} value={chart.layout} options={[['bands', t('Bands')], ['overlay', t('Overlaid')]]} onChange={set('layout')} />
      <Choice name={t('Line')} hint={t('Smooth: a rolling mean whose width follows the zoom. Raw: the 10 s windows as they are.')} label={t('Smoothing')} value={chart.smooth} options={[[true, t('Smooth')], [false, t('Raw')]]} onChange={set('smooth')} />
      <Choice name={t('X axis')} hint={t('By time, the distance under each tick; by distance, the time under each (a run without distance stays by time).')} label={t('X axis')} value={chart.axis} options={[['time', t('Time')], ['distance', t('Distance')]]} onChange={set('axis')} />
      <div className="display-row">
        <label htmlFor="chart-blocks">
          <div className="display-name">{t('Segments on the chart')}</div>
          <div className="muted small">{t('Draw the efforts of every segment in the run; off, only the one pointed at in the chart menu.')}</div>
        </label>
        <input id="chart-blocks" type="checkbox" className="switch" checked={chart.blocks} onChange={(e) => setChart({ blocks: e.target.checked })} />
      </div>
      {/* The Over time charts of Compare ("lacz punkty, linia trenigu ma byc w settingach"); in Settings, not in the setup wizard. */}
      {compare && <><div className="display-row">
        <label htmlFor="chart-join">
          <div className="display-name">{t('Join points')}</div>
          <div className="muted small">{t('On the Over time charts of Compare: each segment’s efforts joined in date order.')}</div>
        </label>
        <input id="chart-join" type="checkbox" className="switch" checked={chart.join} onChange={(e) => setChart({ join: e.target.checked })} />
      </div>
      <div className="display-row">
        <label htmlFor="chart-trend">
          <div className="display-name">{t('Trend line')}</div>
          <div className="muted small">{t('On the Over time charts of Compare: the fitted trend of each segment, its band the noise between its efforts.')}</div>
        </label>
        <input id="chart-trend" type="checkbox" className="switch" checked={chart.trend} onChange={(e) => setChart({ trend: e.target.checked })} />
      </div></>}
    </section>
  );
}

/**
 * The language of the app, and with it its numbers and dates (requirement "Language chosen"), in a tab
 * of its own, Language & region ("wybor jezyka jest w display ... powinnien byc w internationalization
 * ? arbo languages ?"), where other regional choices may come. Kept in this browser.
 */
export function LanguageCard() {
  const [language, setLanguage] = useLanguage();
  return (
    <section className="card display-card" aria-label={t('Language & region')}>
      <div className="settings-head"><div><h2>{t('Language & region')}</h2><p className="muted small">{t('Kept in this browser: they belong to the device, not to the data folder.')}</p></div></div>
      {/* The language (requirement "Language chosen": "ustawienia jezyka w settings i w wizard"): each named in itself, so it is found whatever the language in use. */}
      <div className="display-row">
        <div>
          <div className="display-name">{t('Language')}</div>
          <div className="muted small">{t('The language of the app, its numbers and dates; at first the browser’s.')}</div>
        </div>
        <div className="segmented" role="radiogroup" aria-label={t('Language')}>
          {LOCALES.map((l) => (
            <button key={l.key} type="button" lang={l.key} className={language === l.key ? 'on' : ''} onClick={() => setLanguage(l.key)} role="radio" aria-checked={language === l.key}>{l.name}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * How the app looks and what it may fetch (the runner's request of 21 Nov 2026: "ustawienia schema
 * - light/dark i online/offline przenies do settings"): the theme, the map background from the
 * network and the side menu; the language has a tab of its own (LanguageCard). Kept in this browser.
 */
export function DisplayCard() {
  const [theme, setTheme] = useTheme();
  const [mapTiles, setMapTiles] = useMapTiles();
  const [narrow, setNarrow] = useNarrowMenu();
  return (
    <section className="card display-card" aria-label={t('Look & feel')}>
      <div className="settings-head"><div><h2>{t('Look & feel')}</h2><p className="muted small">{t('Kept in this browser: they belong to the device, not to the data folder.')}</p></div></div>
      <div className="display-row">
        <div>
          <div className="display-name">{t('Theme')}</div>
          <div className="muted small">{t('Light, dark, or as the system is set.')}</div>
        </div>
        <div className="segmented" role="radiogroup" aria-label={t('Theme')}>
          {(['light', 'dark', 'system'] as Theme[]).map((th) => (
            <button key={th} type="button" className={theme === th ? 'on' : ''} onClick={() => setTheme(th)} role="radio" aria-checked={theme === th}>
              {th === 'light' ? t('Light') : th === 'dark' ? t('Dark') : t('System')}
            </button>
          ))}
        </div>
      </div>
      <div className="display-row">
        <label htmlFor="map-tiles">
          <div className="display-name">{t('Map background')} <span className="muted">{t('(online)')}</span></div>
          <div className="muted small">{t('Map tiles from the OpenStreetMap server under a run’s route. The server learns the area of the route shown; off, nothing leaves this device.')}</div>
        </label>
        <input id="map-tiles" type="checkbox" className="switch" checked={mapTiles} onChange={(e) => setMapTiles(e.target.checked)} />
      </div>
      <div className="display-row display-wide">
        <label htmlFor="narrow-menu">
          <div className="display-name">{t('Narrow side menu')}</div>
          <div className="muted small">{t('On a wide screen, the side menu shows its icons only.')}</div>
        </label>
        <input id="narrow-menu" type="checkbox" className="switch" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} />
      </div>
    </section>
  );
}


/**
 * About the app (requirement "App version shown"): its version, the commit and the date of its build,
 * and the release notes of its version.
 */
export function AboutCard() {
  return (
    <section className="card display-card" aria-label={t('About IsoStride')}>
      <div className="settings-head"><div><h2>{t('About IsoStride')}</h2><p className="muted small">{t('The version of the app in this browser; the files it writes to the data folder record it too.')}</p></div></div>
      <div className="display-row">
        <div>
          <div className="display-name">{t('Version {version}', { version: versionLabel(APP_VERSION) })}</div>
          <div className="muted small">
            {APP_VERSION}
            {APP_COMMIT && <> · {t('commit')} <a href={`${REPO_URL}/commit/${APP_COMMIT}`}><code>{APP_COMMIT}</code></a></>}
            {APP_BUILT && <> · {t('built {date}', { date: APP_BUILT })}</>}
          </div>
        </div>
        <a className="btn" href={releaseNotesUrl(APP_VERSION)}>{t('Release notes')}</a>
      </div>
      <Diagnostics />
    </section>
  );
}
