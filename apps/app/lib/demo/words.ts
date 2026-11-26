/**
 * The words of the demo runner's own entries (titles, notes, the names of tags and gear), in the
 * languages of the app: they are data of the demo folder, written once in the language the app is in
 * when the demo is made, as a runner would have typed them.
 */
export type DemoLang = 'en' | 'pl';

export interface Words {
  /** the workout types of the tag dictionary: easy, long, tempo, intervals, hills, race, test */
  types: Record<'easy' | 'long' | 'tempo' | 'intervals' | 'hills' | 'race' | 'test', string>;
  cue: string;
  reps(n: number, what: string): string;
  hills(n: number, metres: number): string;
  fartlek(n: number): string;
  steady(minutes: number): string;
  tempo(minutes: number): string;
  longFast: string;
  longBlocks: string;
  trial(metres: number): string;
  trackRace(metres: number): string;
  roadRace(km: number): string;
  half: string;
  test: string;
  /** notes, by the week of the story */
  notes: Record<number, string>;
  gear: { daily(n: number): string; tempo(n: number): string; race: string; strap: string };
  blocks: { tenMinutes: string; kilometres: string; easy: string; long: string };
  analyses: { kilometres: string; shoes: string; easy: string };
}

export const WORDS: Record<DemoLang, Words> = {
  en: {
    types: { easy: 'easy', long: 'long', tempo: 'tempo', intervals: 'intervals', hills: 'hills', race: 'race', test: 'test' },
    cue: 'quick steps',
    reps: (n, what) => `${n} × ${what}`,
    hills: (n, metres) => `Hills ${n} × ${metres} m`,
    fartlek: (n) => `Fartlek ${n} × 2 min`,
    steady: (minutes) => `Steady ${minutes} min`,
    tempo: (minutes) => `Tempo ${minutes} min`,
    longFast: 'Long run, fast finish',
    longBlocks: 'Long run with 3 × 3 km',
    trial: (metres) => `${metres} m time trial`,
    trackRace: (metres) => `${metres} m, track`,
    roadRace: (km) => `${km} km road race`,
    half: 'Half marathon',
    test: 'Test: 3 min + 12 min all-out',
    notes: {
      9: 'First run after a cold. Easy.',
      25: 'First half marathon. Went out too fast, paid for it after 15 km.',
      59: 'The calf holds. Short and easy for now.',
      77: 'Even pace all the way this time.',
      96: 'Headwind on the way back.',
      102: 'Flat course, no wind.',
    },
    gear: { daily: (n) => `Cruise ${n}`, tempo: (n) => `Tempo ${n}`, race: 'Carbon racer', strap: 'Chest strap' },
    blocks: { tenMinutes: '10-minute effort', kilometres: '1 km reps', easy: 'Easy runs', long: 'Long runs' },
    analyses: { kilometres: '1 km reps over two years', shoes: 'Session shoes compared', easy: 'Easy runs: heart rate and pace' },
  },
  pl: {
    types: { easy: 'spokojny', long: 'długi', tempo: 'tempo', intervals: 'interwały', hills: 'podbiegi', race: 'zawody', test: 'test' },
    cue: 'szybki krok',
    reps: (n, what) => `${n} × ${what}`,
    hills: (n, metres) => `Podbiegi ${n} × ${metres} m`,
    fartlek: (n) => `Zabawa biegowa ${n} × 2 min`,
    steady: (minutes) => `Bieg ciągły ${minutes} min`,
    tempo: (minutes) => `Tempo ${minutes} min`,
    longFast: 'Długie wybieganie z szybką końcówką',
    longBlocks: 'Długie wybieganie z 3 × 3 km',
    trial: (metres) => `Sprawdzian ${metres} m`,
    trackRace: (metres) => `${metres} m, stadion`,
    roadRace: (km) => `Bieg uliczny ${km} km`,
    half: 'Półmaraton',
    test: 'Test: 3 min + 12 min na maksa',
    notes: {
      9: 'Pierwszy bieg po przeziębieniu. Spokojnie.',
      25: 'Pierwszy półmaraton. Za szybki początek, po 15 km było ciężko.',
      59: 'Łydka trzyma. Na razie krótko i spokojnie.',
      77: 'Tym razem równe tempo od startu do mety.',
      96: 'W drodze powrotnej wiatr w twarz.',
      102: 'Płaska trasa, bez wiatru.',
    },
    gear: { daily: (n) => `Cruise ${n}`, tempo: (n) => `Tempo ${n}`, race: 'Startówki z płytką', strap: 'Pas piersiowy' },
    blocks: { tenMinutes: 'Wysiłek 10 minut', kilometres: 'Powtórzenia 1 km', easy: 'Spokojne biegi', long: 'Długie wybiegania' },
    analyses: { kilometres: 'Powtórzenia 1 km przez dwa lata', shoes: 'Porównanie butów treningowych', easy: 'Spokojne biegi: tętno i tempo' },
  },
};
