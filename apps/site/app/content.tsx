import type { ReactNode } from 'react';
import { APP_HOST, APP_URL, REPO_URL } from './links';

/**
 * The site in English and Polish (the runner's request of 24 Nov 2026: "chce tez polskiej wersji
 * jezykowej glownej strony"; requirement "Site in English and Polish"): the same page, each text in
 * both languages, English at /, Polish at /pl.
 */
export type Lang = 'en' | 'pl';
export const LANGS: readonly Lang[] = ['en', 'pl'];
/** The address of the page in each language. */
export const HREF: Record<Lang, string> = { en: '/', pl: '/pl' };
/** Where a language's screenshots of the app are: the app in that language (public/shots, public/shots/pl). */
export const SHOTS: Record<Lang, string> = { en: '/shots', pl: '/shots/pl' };

const GH = <a href={REPO_URL}>source on GitHub</a>;
const GH_PL = <a href={REPO_URL}>kod na GitHubie</a>;
const APP = <a href={APP_URL}>{APP_HOST}</a>;
const REPO = (word: string) => <a href={REPO_URL}>{word}</a>;

export interface Content {
  title: string;
  description: string;
  ogAlt: string;
  home: string;
  sections: string;
  nav: [id: string, label: string][];
  openApp: string;
  source: string;
  /** the link to the page in the other language: its name in that language, its short name */
  other: { name: string; short: string };
  hero: { h1: string; lead: string; facts: ReactNode };
  heroShot: { alt: string; caption: string };
  openFull: string;
  why: { h2: string; paragraphs: string[] };
  local: { h2: string; lead: string; qa: [string, string][] };
  diagram: {
    label: string; computer: string; watch: string; exports: string; folder: string; folderHolds: string;
    reads: string; writes: string; browser: string; runsHere: string; nothing: string; noServer: string;
  };
  metrics: { h2: string; lead: string; rows: [string, string][]; shots: [name: string, alt: string, caption: string][] };
  models: { h2: string; lead: string; what: string; method: string; rows: [string, string][]; shots: [name: string, alt: string, caption: string][] };
  open: {
    h2: string; lead: string; rows: [string, ReactNode][];
    invite: { h3: string; text: string; idea: string; pr: string };
  };
  start: { h2: string; steps: ReactNode[] };
  foot: { source: ReactNode; notes: string };
}

const MODEL_ROWS_EN: [string, string][] = [
  ['Training load of a run', 'Banister TRIMP (1991), Edwards TRIMP (1993), rTSS, power TSS'],
  ['Fitness, fatigue and form', 'Banister’s impulse-response model (CTL, ATL, TSB), also fitted to your own results'],
  ['Critical speed and D′, critical power and W′', 'Monod and Scherrer (1965)'],
  ['Race time predictions', 'Riegel’s power law (1981)'],
  ['VO2max', 'From heart rate, and VDOT after Daniels and Gilbert (1979)'],
  ['Intensity distribution', 'Time in heart rate zones; low, moderate and high after Seiler'],
  ['Aerobic efficiency', 'Efficiency factor and pace to heart rate decoupling'],
];

export const CONTENT: Record<Lang, Content> = {
  en: {
    title: 'IsoStride · an open platform for analysing your runs',
    description: 'IsoStride is an open platform for analysing your runs: the metrics in the FIT files of your watch and performance models, open source so you can add your own. It runs in your browser: no account, no cloud, your data stays on your computer.',
    ogAlt: 'The Dashboard of IsoStride, on demo data',
    home: 'IsoStride, home',
    sections: 'Sections',
    nav: [['why', 'Why'], ['local', 'Local and open source'], ['metrics', 'Metrics'], ['models', 'Models'], ['open', 'Open platform']],
    openApp: 'Open the app',
    source: 'Source on GitHub',
    other: { name: 'Polski', short: 'PL' },
    hero: {
      h1: 'IsoStride is an open platform for analysing your runs.',
      lead: 'It reads the FIT files your watch exports and analyses their metrics in your browser. It is open source, so you can add your own models and analyses. There is no account and no cloud: the files, and everything computed from them, stay in a folder on your disk.',
      facts: <>Free, MIT licence · {GH} · Chrome, Edge or Opera on a desktop</>,
    },
    heroShot: {
      alt: 'The Dashboard of IsoStride: this week’s running, form, the last run, fitness and fatigue, critical speed and recent runs.',
      caption: 'The Dashboard. The screens on this page show demo data of a made-up runner with a critical speed of about 3:15 /km; click one to open it full size.',
    },
    openFull: 'Open full size.',
    why: {
      h2: 'Why it exists',
      paragraphs: [
        'Most running apps are training logs. They record what you did: the calendar, the weekly totals, the plan. Their tools for analysing and comparing the data are limited.',
        'The tools that go deeper are mostly closed services: you upload your runs, you cannot see how a figure is computed, and you cannot add a model of your own. Open tools of this kind for running are hard to find.',
        'IsoStride is built for that part only. You can look at any metric in the file, follow the same segment across months, compare one group of efforts with another, and run the performance models on your own history, with the code open and the data on your disk.',
        'It does not replace your training log. It does not plan training and has no feed or sharing. Keep your log where it is, and bring your runs in as FIT files: exported by hand, or fetched from your COROS account.',
      ],
    },
    local: {
      h2: 'Local and open source',
      lead: 'Runs are health data, with the places where you live and train. IsoStride is built so that they never leave your computer.',
      qa: [
        ['Where is my data?', 'In a folder you choose on your disk. IsoStride reads the FIT files there and writes what it computes next to them, in .isostride/, as JSON files you can open, copy or delete.'],
        ['What is sent to a server?', 'Nothing. There is no server and no account. The app is a static web page; your files are read by your browser and never uploaded. The network is used only for the map background, off until you switch it on, and for COROS if you connect it: then your browser talks to COROS directly and downloads your runs from it.'],
        ['Can I check that?', 'Yes. The code is on GitHub, with its tests. You can read it, build it and run it yourself.'],
        ['Which watches?', 'Any watch that exports FIT files. It is tested on files from COROS and Garmin; files from Suunto, Wahoo or Polar should read too, and if one does not, an issue with the file helps.'],
        ['Can it fetch my runs from COROS?', 'Yes. On the Data screen, under Integrations, connect your COROS account: you sign in on COROS’s own page, and IsoStride downloads the FIT files of your runs into your folder, the last 30 days first, then what is new each time you fetch. The sign-in stays in your browser, and the files go straight from COROS to your disk. COROS allows 50 files a day, so a long history comes in over a few days.'],
      ],
    },
    diagram: {
      label: 'Diagram: your watch exports FIT files into a folder you choose. IsoStride, in your browser, reads them and writes its results back into the folder. Both are on your computer. Nothing is uploaded: there is no server and no account.',
      computer: 'your computer', watch: 'Your watch', exports: 'exports FIT files', folder: 'A folder you choose', folderHolds: 'FIT files and .isostride/',
      reads: 'reads', writes: 'writes', browser: 'Your browser', runsHere: 'IsoStride runs here', nothing: 'Nothing is uploaded', noServer: 'no server, no account',
    },
    metrics: {
      h2: 'Analysis of metrics',
      lead: 'Every numeric field in the file is a metric: pace, heart rate, cadence, ground contact time, vertical oscillation, step length, power, and whatever else your watch or its apps record, for example COROS Form Power, Garmin stance time balance or the fields of Stryd.',
      rows: [
        ['A single run', 'Up to four metrics on one chart, with your zones, the laps and the map. Select any part of the run to get its minimum, average and maximum.'],
        ['Segments', 'A route you run often, the laps of a workout, or a rule you write, such as the fastest 5 minutes with the heart rate above 160. The app finds every occurrence in your runs.'],
        ['Change over time', 'A metric on one segment across months, with a fitted trend, the variation between efforts and a 95% interval. A change is reported only when it is larger than that variation.'],
        ['A/B comparison', 'The same segment split by shoes, heart rate sensor, watch or workout type.'],
        ['Export', 'Every segment with its metrics and context as CSV.'],
      ],
      shots: [
        ['run', 'A run in IsoStride: pace, heart rate, cadence and ground contact time of an interval session on one chart, with the laps and the map beside it.', 'A run: an interval session of 6 × 1 km, four metrics on one chart, the laps and the route.'],
        ['trend', 'The Compare screen: the pace and ground contact time of every 1 km repetition over five months, with trend lines and the table of changes.', 'A segment over time: every 1 km repetition over five months, with the trend and the table of changes.'],
        ['ab', 'The A/B tab of Compare: ground contact time of the 1 km repetitions in two pairs of shoes, with the difference and its interval.', 'A/B: the same repetitions in two pairs of shoes, with the difference, its 95% interval and a warning that the comparison is not a fair one.'],
      ],
    },
    models: {
      h2: 'Performance models',
      lead: 'The models are published ones, not IsoStride’s own. Each one names its method, shows the inputs it used, and says which of its assumptions your data meets and which it does not.',
      what: 'What',
      method: 'Method',
      rows: MODEL_ROWS_EN,
      shots: [
        ['critical', 'The Performance screen: critical speed and critical power over five months, fitted to the best efforts.', 'Critical speed and D′, critical power and W′, fitted to the best efforts of the last 90 days.'],
        ['form', 'The Performance screen: daily load, fitness, fatigue and form over time.', 'Fitness, fatigue and form from the load of every run.'],
      ],
    },
    open: {
      h2: 'An open platform',
      lead: 'IsoStride is meant to be built on. The code is open, and the models and analyses are ordinary TypeScript modules with tests, not a closed engine. If a model you use is missing, or you want to analyse your data in a way the app does not, you can add it.',
      rows: [
        ['Your own model', <>The performance models are in <code>apps/app/lib/load</code> and <code>lib/curve</code>. A new one is added the same way: it states its inputs and assumptions, and gets its view on the Performance screen.</>],
        ['Your own analysis', <>Trends, A/B comparisons and their statistics are in <code>lib/compare</code> and <code>lib/stats</code>; the rules that find segments are in <code>lib/blocks</code> and <code>lib/detection</code>.</>],
        ['Your own metrics', 'Nothing to write: every numeric field in a FIT file, also from apps on your watch, becomes a metric by itself.'],
      ],
      invite: {
        h3: 'Contributions are welcome',
        text: 'Code or ideas, both help. If you have written a model or an analysis, open a pull request. If you only know what is missing, a model you rely on, a comparison you would like to make, a watch whose files do not read well, describe it in an issue. You do not need to write code to take part.',
        idea: 'Suggest an idea',
        pr: 'Open a pull request',
      },
    },
    start: {
      h2: 'Getting started',
      steps: [
        'Export your runs as FIT files (COROS: Training Hub, Export; Garmin Connect: Export Original) and put them in one folder. With COROS you can skip this: connect your account in the app and it fetches them.',
        <>Open {APP} in Chrome, Edge or Opera on a desktop. Safari and Firefox cannot give a web page access to a folder.</>,
        <>Choose the folder: the runs are imported by themselves, and so is every new file you add. To run the app yourself, clone the {REPO('repository')} and run <code>npm install</code>, then <code>npm run dev</code>.</>,
      ],
    },
    foot: { source: <>{GH} (MIT)</>, notes: 'release notes' },
  },

  pl: {
    title: 'IsoStride · otwarta platforma do analizy biegów',
    description: 'IsoStride to otwarta platforma do analizy biegów. Wczytuje pliki FIT z zegarka, pokazuje wszystkie zapisane w nich metryki i liczy modele wydolności. Kod jest otwarty, więc możesz dopisać własne. Działa w przeglądarce: bez konta i bez chmury, dane zostają u Ciebie.',
    ogAlt: 'Pulpit IsoStride na danych demonstracyjnych',
    home: 'IsoStride, strona główna',
    sections: 'Sekcje',
    nav: [['why', 'Po co'], ['local', 'Dane u Ciebie'], ['metrics', 'Metryki'], ['models', 'Modele'], ['open', 'Otwarty kod']],
    openApp: 'Otwórz aplikację',
    source: 'Kod na GitHubie',
    other: { name: 'English', short: 'EN' },
    hero: {
      h1: 'IsoStride: otwarta platforma do analizy biegów.',
      lead: 'Wskazujesz pliki FIT wyeksportowane z zegarka, a IsoStride analizuje je w przeglądarce. Kod jest otwarty, więc możesz dodać własne modele i analizy. Nie zakładasz konta i nic nie trafia do chmury: pliki i wszystkie wyniki zostają w folderze na Twoim dysku.',
      facts: <>Bezpłatnie, licencja MIT · {GH_PL} · Chrome, Edge lub Opera na komputerze</>,
    },
    heroShot: {
      alt: 'Pulpit IsoStride: kilometry z tego tygodnia, forma, ostatni bieg, sprawność i zmęczenie, prędkość krytyczna i ostatnie biegi.',
      caption: 'Pulpit. Zrzuty na tej stronie pokazują dane demonstracyjne fikcyjnego biegacza z prędkością krytyczną około 3:15 /km. Kliknij zrzut, żeby go powiększyć.',
    },
    openFull: 'Powiększ.',
    why: {
      h2: 'Dlaczego IsoStride',
      paragraphs: [
        'Większość aplikacji biegowych to dzienniki treningowe. Zapisują, co zrobiłeś: kalendarz, kilometry w tygodniu, plan. Z samymi danymi niewiele jednak pozwalają zrobić.',
        'Narzędzia do głębszej analizy to zwykle zamknięte serwisy. Wysyłasz do nich swoje biegi, nie wiesz, jak liczone są wyniki, i nie dodasz własnego modelu. Otwartych narzędzi tego typu dla biegaczy właściwie nie ma.',
        'IsoStride zajmuje się wyłącznie analizą. Obejrzysz w nim każdą metrykę zapisaną w pliku, prześledzisz ten sam odcinek na przestrzeni miesięcy, porównasz jedną grupę wysiłków z inną i policzysz modele wydolności na własnej historii. Kod jest otwarty, a dane zostają na Twoim dysku.',
        'To nie jest zamiennik dziennika treningowego. IsoStride nie planuje treningów i nie ma części społecznościowej. Prowadź dziennik tam, gdzie zawsze. Biegi trafiają do IsoStride jako pliki FIT: eksportujesz je sam albo aplikacja pobiera je z Twojego konta COROS.',
      ],
    },
    local: {
      h2: 'Dane zostają u Ciebie',
      lead: 'Biegi to dane o zdrowiu, a przy okazji mapa miejsc, w których mieszkasz i trenujesz. Dlatego IsoStride nigdzie ich nie wysyła.',
      qa: [
        ['Gdzie są moje dane?', 'W folderze, który sam wskażesz na dysku. IsoStride czyta z niego pliki FIT, a wyniki zapisuje obok, w podfolderze .isostride/, jako zwykłe pliki JSON. Możesz je otworzyć, skopiować albo usunąć.'],
        ['Czy coś trafia na serwer?', 'Nie. Nie ma serwera ani kont. Aplikacja to statyczna strona, a pliki czyta Twoja przeglądarka i nigdzie ich nie wysyła. Internetu potrzebuje tylko podkład mapy, domyślnie wyłączony, i COROS, jeśli go połączysz. Wtedy przeglądarka łączy się bezpośrednio z COROS i pobiera z niego Twoje biegi.'],
        ['Jak mogę to sprawdzić?', 'Cały kod, razem z testami, jest na GitHubie. Możesz go przejrzeć, zbudować i uruchomić u siebie.'],
        ['Jakie zegarki są obsługiwane?', 'Każdy, który eksportuje pliki FIT. Aplikację testujemy na plikach z COROS i Garmina; pliki z Suunto, Wahoo czy Polara też powinny się wczytać. Jeśli któryś nie zadziała, zgłoś to na GitHubie i dołącz plik.'],
        ['Czy biegi mogą przyjść prosto z COROS?', 'Tak. Na ekranie Dane, w sekcji Integracje, połącz swoje konto COROS. Logujesz się na stronie samego COROS, a IsoStride pobiera pliki FIT Twoich biegów do folderu: najpierw z ostatnich 30 dni, potem przy każdym pobraniu to, co nowe. Logowanie zostaje w przeglądarce, a pliki trafiają z COROS prosto na Twój dysk. COROS daje 50 plików dziennie, więc dłuższa historia spłynie w kilka dni.'],
      ],
    },
    diagram: {
      label: 'Schemat: zegarek eksportuje pliki FIT do wybranego folderu. IsoStride działa w przeglądarce, czyta te pliki i zapisuje wyniki z powrotem w folderze. Wszystko dzieje się na Twoim komputerze: nie ma serwera ani konta.',
      computer: 'Twój komputer', watch: 'Zegarek', exports: 'eksportuje pliki FIT', folder: 'Wybrany folder', folderHolds: 'pliki FIT i .isostride/',
      reads: 'czyta', writes: 'zapisuje', browser: 'Przeglądarka', runsHere: 'tu działa IsoStride', nothing: 'Nic nie jest wysyłane', noServer: 'bez serwera i bez konta',
    },
    metrics: {
      h2: 'Analiza metryk',
      lead: 'Metryką jest każde pole liczbowe w pliku: tempo, tętno, kadencja, czas kontaktu z podłożem, oscylacja pionowa, długość kroku, moc i wszystko inne, co zapisuje Twój zegarek albo zainstalowane na nim aplikacje, na przykład Form Power z COROS, balans czasu kontaktu z Garmina czy pola Stryda.',
      rows: [
        ['Pojedynczy bieg', 'Do czterech metryk na jednym wykresie, razem z Twoimi strefami, okrążeniami i mapą. Zaznacz dowolny fragment, a zobaczysz jego minimum, średnią i maksimum.'],
        ['Segmenty', 'Trasa, którą często biegasz, okrążenia z treningu albo własna reguła, na przykład najszybsze 5 minut przy tętnie powyżej 160. Aplikacja sama znajdzie wszystkie takie fragmenty w Twoich biegach.'],
        ['Zmiany w czasie', 'Jedna metryka na jednym segmencie przez wiele miesięcy: dopasowany trend, rozrzut między wysiłkami i 95-procentowy przedział. Zmianę widać dopiero wtedy, gdy wyraźnie wychodzi poza ten rozrzut.'],
        ['Porównanie A/B', 'Ten sam segment w podziale na buty, czujnik tętna, zegarek albo rodzaj treningu.'],
        ['Eksport', 'Wszystkie segmenty z metrykami i kontekstem w jednym pliku CSV.'],
      ],
      shots: [
        ['run', 'Bieg w IsoStride: tempo, tętno, kadencja i czas kontaktu z podłożem z treningu interwałowego na jednym wykresie, obok okrążenia i mapa.', 'Bieg: interwały 6 × 1 km. Cztery metryki na jednym wykresie, okrążenia i trasa.'],
        ['trend', 'Ekran Porównaj: tempo i czas kontaktu z podłożem we wszystkich powtórzeniach 1 km z pięciu miesięcy, z liniami trendu i tabelą zmian.', 'Segment w czasie: wszystkie powtórzenia 1 km z pięciu miesięcy, z trendem i tabelą zmian.'],
        ['ab', 'Zakładka A/B: czas kontaktu z podłożem w powtórzeniach 1 km w dwóch parach butów, z różnicą i jej przedziałem.', 'A/B: te same powtórzenia w dwóch parach butów. Różnica, jej 95-procentowy przedział i ostrzeżenie, że grupy nie są w pełni porównywalne.'],
      ],
    },
    models: {
      h2: 'Modele wydolności',
      lead: 'IsoStride nie wymyśla własnych wzorów, tylko korzysta z modeli opisanych w literaturze. Każdy podaje swoją metodę, pokazuje, z jakich danych korzysta, i mówi wprost, które założenia Twoje dane spełniają, a które nie.',
      what: 'Co liczy',
      method: 'Metoda',
      rows: [
        ['Obciążenie treningowe', 'TRIMP Banistera (1991), TRIMP Edwardsa (1993), rTSS, TSS z mocy'],
        ['Sprawność, zmęczenie i forma', 'Model impuls–odpowiedź Banistera (CTL, ATL, TSB), także dopasowany do Twoich wyników'],
        ['Prędkość krytyczna i D′, moc krytyczna i W′', 'Monod i Scherrer (1965)'],
        ['Prognozy czasów na zawodach', 'Wzór potęgowy Riegla (1981)'],
        ['VO2max', 'Z tętna oraz VDOT według Danielsa i Gilberta (1979)'],
        ['Rozkład intensywności', 'Czas w strefach tętna, w podziale na niską, umiarkowaną i wysoką intensywność według Seilera'],
        ['Wydolność tlenowa', 'Współczynnik efektywności i dryf tętna względem tempa (decoupling)'],
      ],
      shots: [
        ['critical', 'Ekran Wydolność: prędkość i moc krytyczna na przestrzeni pięciu miesięcy, dopasowane do najlepszych wysiłków.', 'Prędkość krytyczna i D′ oraz moc krytyczna i W′, dopasowane do najlepszych wysiłków z ostatnich 90 dni.'],
        ['form', 'Ekran Wydolność: dzienne obciążenie, sprawność, zmęczenie i forma w czasie.', 'Sprawność, zmęczenie i forma liczone z obciążenia każdego biegu.'],
      ],
    },
    open: {
      h2: 'Otwarty kod, otwarta platforma',
      lead: 'IsoStride jest pomyślane jako baza do rozbudowy. Kod jest otwarty, a modele i analizy to zwykłe moduły w TypeScripcie z testami, nie zamknięta czarna skrzynka. Brakuje modelu, z którego korzystasz, albo chcesz spojrzeć na dane po swojemu? Możesz to dopisać.',
      rows: [
        ['Własny model', <>Modele wydolności są w <code>apps/app/lib/load</code> i <code>lib/curve</code>. Nowy dodaje się tak samo: opisuje swoje dane wejściowe i założenia, a na ekranie Wydolność dostaje własny widok.</>],
        ['Własna analiza', <>Trendy, porównania A/B i statystyka są w <code>lib/compare</code> i <code>lib/stats</code>, a reguły wyszukujące segmenty w <code>lib/blocks</code> i <code>lib/detection</code>.</>],
        ['Własne metryki', 'Tu nie trzeba nic pisać: każde pole liczbowe z pliku FIT, także z aplikacji na zegarku, samo staje się metryką.'],
      ],
      invite: {
        h3: 'Każda pomoc się przyda',
        text: 'Liczy się zarówno kod, jak i pomysły. Masz gotowy model albo analizę? Otwórz pull request. Wiesz tylko, czego brakuje: modelu, z którego korzystasz, porównania, które chcesz zrobić, albo zegarka, którego pliki się nie wczytują? Opisz to w zgłoszeniu na GitHubie. Nie musisz programować, żeby pomóc.',
        idea: 'Zgłoś pomysł',
        pr: 'Otwórz pull request',
      },
    },
    start: {
      h2: 'Jak zacząć',
      steps: [
        'Wyeksportuj biegi jako pliki FIT (COROS: Training Hub → Export; Garmin Connect: Export Original) i zapisz je w jednym folderze. Z COROS możesz ten krok pominąć: połącz konto w aplikacji, a ona sama je pobierze.',
        <>Otwórz {APP} w Chrome, Edge lub Operze na komputerze. Safari i Firefox nie dają stronom internetowym dostępu do folderów.</>,
        <>Wskaż folder: biegi zaimportują się same, tak jak każdy nowy plik, który do niego dodasz. Jeśli wolisz uruchomić aplikację u siebie, sklonuj {REPO('repozytorium')} i wpisz <code>npm install</code>, a potem <code>npm run dev</code>.</>,
      ],
    },
    foot: { source: <>{GH_PL} (MIT)</>, notes: 'informacje o wydaniu' },
  },
};
