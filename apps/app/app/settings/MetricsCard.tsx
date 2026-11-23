'use client';

import { useState } from 'react';
import { METRICS_CHANGED, useMetrics } from '@/components';
import { useOpenFolder } from '@/lib/client';
import { metricInfo } from '@/lib/kernel';
import { readSettings, writeSettings } from '@/lib/settings';

const WORDS = { higher: 'Higher is better', lower: 'Lower is better', neutral: 'Neither (up or down)' } as const;

/**
 * The folder's metrics, each with which way is better (requirement "Metric direction set by the
 * runner"): the app's own for the metrics it knows, none for the others until the runner sets it.
 * Verdicts word a change as better or worse only in a direction known or set.
 */
export function MetricsCard() {
  const { folder } = useOpenFolder();
  const { catalog, directions, blockKeys } = useMetrics();
  const [status, setStatus] = useState<string | null>(null);

  const choose = async (key: string, choice: 'app' | 'higher' | 'lower') => {
    const before = await readSettings(folder);
    const next = { ...(before.directions ?? {}) };
    if (choice === 'app') delete next[key];
    else next[key] = choice;
    await writeSettings(folder, { schemaVersion: 1, ...(before.defaults ? {} : { zones: before.zones }), performance: before.performance, directions: next });
    window.dispatchEvent(new Event(METRICS_CHANGED));
    setStatus('Saved');
  };

  return (
    <section className="card settings-metrics" aria-label="Metrics">
      <div className="settings-head">
        <div>
          <h2>Metrics</h2>
          <p className="muted small">Every metric your files hold, with its unit as the file gives it. For each, which way is better: Compare words a change as better or worse only where this is known; otherwise it says only higher or lower.</p>
        </div>
        <span className="spacer" />
        {status && <span className="muted small" role="status">{status}</span>}
      </div>
      <div className="metric-rows">
        {blockKeys.map((key) => {
          const m = metricInfo(key, catalog);
          const set = directions[key];
          const own = m.direction;
          return (
            <div key={key} className="metric-row">
              <span className="metric-name">{m.name}{m.unit ? <span className="muted"> · {m.unit}</span> : null}{m.origin === 'developer' ? <span className="chip small">app field</span> : null}</span>
              <select className="select small" aria-label={`Which way is better for ${m.name}`} value={set ?? 'app'} onChange={(e) => { setStatus(null); void choose(key, e.target.value as 'app' | 'higher' | 'lower'); }}>
                <option value="app">{own === 'neutral' ? 'Not set: up or down' : `As the app has it: ${WORDS[own].toLowerCase()}`}</option>
                <option value="higher">{WORDS.higher}</option>
                <option value="lower">{WORDS.lower}</option>
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}
