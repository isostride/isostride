import type { CheckStatus, ModelKey, ModelReport } from './assumptions';

/**
 * What the runner can do so that the models work as they should (the runner's request of 21 Nov
 * 2026: "w sekcji performance chce zakladke todo .. w ktorej jest lista rzeczy do zrobienia aby
 * modele dzialay poprawnie"; requirement "To do for the models"). Each item comes from checks of the
 * models' assumptions that the runner can change; the limits of a method, which nothing the runner
 * does can change (a population formula, a contested band), stay behind the models' "Why?".
 */

/** set: a setting, done at once; train: something to run; record: something to record in the runs; wait: it comes with time. */
export type TodoKind = 'set' | 'train' | 'record' | 'wait';
/** Where it is done in the app: the Model tab of Performance, Settings (zones), Settings → Gear, the Data folder screen. */
export type TodoPlace = 'model' | 'zones' | 'gear' | 'folder' | null;

export interface Todo {
  key: string;
  kind: TodoKind;
  title: string;
  /** what to do, in a sentence */
  how: string;
  /** what the data show now: a line per check behind it, as the first model it holds back states it */
  now: string[];
  place: TodoPlace;
  /** the models it holds back */
  models: ModelKey[];
  /** the worst status among its checks: unmet before doubt before unknown */
  status: Exclude<CheckStatus, 'met'>;
  done: boolean;
}

interface Action { key: string; kind: TodoKind; title: string; how: string; place: TodoPlace }

/** The checks the runner can act on, by their key, and what to do for each (model's choices). */
const ACTIONS: Record<string, Action> = {
  resthr: { key: 'resthr', kind: 'set', place: 'model', title: 'Set your resting heart rate', how: 'Measure it lying down on waking, a few mornings in a row, and save the lowest in the Model tab.' },
  maxhr: { key: 'maxhr', kind: 'set', place: 'model', title: 'Set your maximum heart rate', how: 'Enter it in the Model tab if you know it from a test; else the highest of your runs stands in, too low unless you have gone all out.' },
  zones: { key: 'zones', kind: 'set', place: 'zones', title: 'Save your own heart rate zones', how: 'Enter your zones in Settings, or fill them from your maximum heart rate, and save.' },
  sensor: { key: 'sensor', kind: 'set', place: 'gear', title: 'Register your heart rate strap', how: 'Add the strap in Settings → Gear, with the dates you wore it; the wrist sensor misreads most at high intensity.' },
  hr: { key: 'hr', kind: 'record', place: null, title: 'Record heart rate in every run', how: 'Wear the watch snug, or a strap, so each run has its heart rate.' },
  coverage: { key: 'coverage', kind: 'record', place: null, title: 'Record what the load model needs in every run', how: 'A run without it is counted from its duration only: record heart rate (or power, for the power model) in each run.' },
  power: { key: 'power', kind: 'record', place: null, title: 'Record power in your runs', how: 'Run with power on the watch (or a pod), so the power models have runs to rest on.' },
  watch: { key: 'watch', kind: 'record', place: null, title: 'Take your power from one watch', how: 'Running power differs between makers and models: keep to one for the power models.' },
  allout: { key: 'allout', kind: 'train', place: null, title: 'Run all-out efforts of 2–20 minutes', how: 'Run a few lengths flat out, each fresh and on its own (for example 3, 5 and 10 minutes, or a 5 km race), every few weeks.' },
  lengths: { key: 'allout', kind: 'train', place: null, title: '', how: '' },
  separate: { key: 'allout', kind: 'train', place: null, title: '', how: '' },
  shape: { key: 'allout', kind: 'train', place: null, title: '', how: '' },
  recent: { key: 'allout', kind: 'train', place: null, title: '', how: '' },
  wprime: { key: 'allout', kind: 'train', place: null, title: '', how: '' },
  dprime: { key: 'allout', kind: 'train', place: null, title: '', how: '' },
  easy: { key: 'easy', kind: 'train', place: null, title: 'Run easy runs', how: 'Run easy, in Z1–Z2, a few times a week: the efficiency trend reads those runs only.' },
  long: { key: 'long', kind: 'train', place: null, title: 'Run long runs', how: 'Run 60 minutes or more at an even, easy pace now and then: decoupling reads those runs.' },
  runs: { key: 'runs', kind: 'train', place: null, title: 'Run steady runs of 20 minutes or more', how: 'Steady runs at a moderate effort give VO2max from heart rate its estimates.' },
  history: { key: 'history', kind: 'wait', place: 'folder', title: 'Build up the history', how: 'Keep importing your runs: the averages settle after a few weeks to a few months.' },
  recorded: { key: 'recorded', kind: 'record', place: 'folder', title: 'Import all your running', how: 'Put every run in the data folder: a run missing from it is missing from your load.' },
  points: { key: 'fitted', kind: 'wait', place: null, title: 'Give the fitted response more performances', how: 'Keep running the runs that measure your performance (hard efforts, steady runs): the fit needs many over a long period.' },
  fit: { key: 'fitted', kind: 'wait', place: null, title: '', how: '' },
  identified: { key: 'fitted', kind: 'wait', place: null, title: '', how: '' },
  fatigue: { key: 'fitted', kind: 'wait', place: null, title: '', how: '' },
};
const RANK: Record<Exclude<CheckStatus, 'met'>, number> = { unmet: 0, doubt: 1, unknown: 2 };
const KIND_ORDER: TodoKind[] = ['set', 'record', 'train', 'wait'];

/**
 * The to-do list of the models: an item per action, from every check it covers in every model,
 * open while one of those checks does not hold, done when all of them hold. The open items first,
 * settings before what to record, to run and to wait for; within those, the worse first.
 */
export function todoList(models: ModelReport[]): Todo[] {
  const items = new Map<string, Todo & { lead: Action }>();
  for (const m of models) {
    for (const c of m.checks) {
      const a = ACTIONS[c.key];
      if (!a) continue;
      // A model with nothing to compute from asks only for what to record: its other checks wait for the data.
      if (m.trust === 'nodata' && a.kind !== 'record') continue;
      const lead = ACTIONS[a.key] ?? a;
      const item = items.get(lead.key) ?? { key: lead.key, kind: lead.kind, title: lead.title, how: lead.how, place: lead.place, now: [], models: [], status: 'unknown' as const, done: true, lead };
      if (c.status !== 'met') {
        item.done = false;
        if (!item.models.includes(m.key)) item.models.push(m.key);
        // One line per check: the same check in several models says the same of the data.
        if (!item.now.some((l) => l.startsWith(`${c.label}: `))) item.now.push(`${c.label}: ${c.detail}`);
        if (RANK[c.status] < RANK[item.status]) item.status = c.status;
      }
      items.set(lead.key, item);
    }
  }
  // An item only an unknown check keeps open is one the runner must judge, not a fault: kept, last of its kind.
  return [...items.values()]
    .map(({ lead: _lead, ...t }) => t)
    .sort((a, b) => Number(a.done) - Number(b.done) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || RANK[a.status] - RANK[b.status]);
}
