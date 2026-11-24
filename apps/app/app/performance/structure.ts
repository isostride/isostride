import type { ModelGroup, ModelKey } from '@/lib/load';

/**
 * The Performance screen by the evidence its models rest on (requirement "Performance structured
 * by evidence"): an overview, a tab per group with its views, and what to do. The load model is
 * chosen at the top of Load, its values set in Settings › Models (the runner's "tak" to it: "mam
 * wrazenie ze wszystkie modele sa pomieszane").
 */
export type Tab = 'overview' | ModelGroup;

export interface View {
  key: string;
  name: string;
  /** the models the view shows, whose assumptions stand beside it */
  models: ModelKey[];
}

export const TABS: { key: Tab; name: string; /** the evidence a group's models rest on */ evidence?: string; views: View[] }[] = [
  { key: 'overview', name: 'Overview', views: [] },
  {
    key: 'load', name: 'Load', evidence: 'what you did: from every run', views: [
      { key: 'form', name: 'Form', models: ['load', 'form', 'acwr'] },
      { key: 'weekly', name: 'Weekly load', models: ['load', 'weekly'] },
      { key: 'intensity', name: 'Intensity', models: ['intensity'] },
    ],
  },
  {
    key: 'capacity', name: 'Capacity', evidence: 'what you can do: from your all-out efforts', views: [
      { key: 'efforts', name: 'Best efforts', models: ['efforts', 'powerEfforts'] },
      { key: 'critical', name: 'Critical speed and power', models: ['cs', 'cp'] },
      { key: 'predictions', name: 'Predictions and VDOT', models: ['predictions', 'vdot'] },
    ],
  },
  {
    key: 'aerobic', name: 'Aerobic', evidence: 'how efficiently you run: from everyday runs and their heart rate', views: [
      { key: 'efficiency', name: 'Efficiency', models: ['ef'] },
      { key: 'decoupling', name: 'Decoupling', models: ['decoupling'] },
      { key: 'vo2', name: 'VO2max from heart rate', models: ['vo2hr', 'uth'] },
    ],
  },
  {
    key: 'response', name: 'Response', evidence: 'how load turns into performance: from your loads and a measure of performance', views: [
      { key: 'hr', name: 'On VO2max from heart rate', models: ['fittedHr'] },
      { key: 'vdot', name: 'On VDOT', models: ['fittedVdot'] },
    ],
  },
];

/** The link of a tab and view of the Performance screen. */
export const performanceHref = (tab: string, view?: string) => `/performance${tab === 'overview' ? '' : `?tab=${tab}${view ? `&view=${view}` : ''}`}`;
