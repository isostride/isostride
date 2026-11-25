import { msg } from '@/lib/i18n';
import type { ModelGroup, ModelKey } from '@/lib/load';

/**
 * The Performance screen by the evidence its models rest on (requirement "Performance structured
 * by evidence"): an overview, a tab per group with its views, and what to do. The load model is
 * chosen at the top of Load, its values set in Settings › Models (the runner's "tak" to it: "mam
 * wrazenie ze wszystkie modele sa pomieszane"). The names and the evidence are keys, shown through t();
 * an evidence keeps its colon in every language (the map of the models shows the part after it).
 */
/** What if is no group of models: it feeds those of Capacity and Load with what did not happen. */
export type Tab = 'overview' | ModelGroup | 'whatif';

export interface View {
  key: string;
  name: string;
  /** the models the view shows, whose assumptions stand beside it */
  models: ModelKey[];
}

export const TABS: { key: Tab; name: string; /** the evidence a group's models rest on */ evidence?: string; views: View[] }[] = [
  { key: 'overview', name: msg('Overview'), views: [] },
  {
    key: 'load', name: msg('Load'), evidence: msg('what you did: from every run'), views: [
      { key: 'form', name: msg('Form'), models: ['load', 'form', 'acwr'] },
      { key: 'weekly', name: msg('Weekly load'), models: ['load', 'weekly'] },
      { key: 'intensity', name: msg('Intensity'), models: ['intensity'] },
    ],
  },
  {
    key: 'capacity', name: msg('Capacity'), evidence: msg('what you can do: from your all-out efforts'), views: [
      { key: 'efforts', name: msg('Best efforts'), models: ['efforts', 'powerEfforts'] },
      { key: 'critical', name: msg('Critical speed and power'), models: ['cs', 'cp'] },
      { key: 'predictions', name: msg('Predictions and VDOT'), models: ['predictions', 'vdot'] },
    ],
  },
  {
    key: 'aerobic', name: msg('Aerobic'), evidence: msg('how efficiently you run: from everyday runs and their heart rate'), views: [
      { key: 'efficiency', name: msg('Efficiency'), models: ['ef'] },
      { key: 'decoupling', name: msg('Decoupling'), models: ['decoupling'] },
      { key: 'vo2', name: msg('VO2max from heart rate'), models: ['vo2hr', 'uth'] },
    ],
  },
  {
    key: 'response', name: msg('Response'), evidence: msg('how load turns into performance: from your loads and a measure of performance'), views: [
      { key: 'hr', name: msg('On VO2max from heart rate'), models: ['fittedHr'] },
      { key: 'vdot', name: msg('On VDOT'), models: ['fittedVdot'] },
    ],
  },
  {
    // The runner's request of 25 Nov 2026: "co gdybym mial takie a nie inne obciazenia; jak by krzywa
    // mocy wygladala gdybym 20 min przebiegl 3 minuty szybciej", and "podoba mi sie what if na ekranie performance".
    key: 'whatif', name: msg('What if'), views: [
      { key: 'curve', name: msg('An effort'), models: ['cs', 'predictions', 'vdot'] },
      { key: 'load', name: msg('Weeks of load'), models: ['load', 'form', 'acwr'] },
    ],
  },
];

/** The link of a tab and view of the Performance screen. */
// i18n-ignore
export const performanceHref = (tab: string, view?: string) => `/performance${tab === 'overview' ? '' : `?tab=${tab}${view ? `&view=${view}` : ''}`}`;
