import { LocalDiagram } from './LocalDiagram';
import { Logo } from './Logo';
import { Shot } from './Shot';
import { APP_HOST, APP_URL, REPO_URL } from './links';

/** The version of the app deployed with the site (its build reads it from package.json), a patch of 0 left out. */
const VERSION = (process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0').replace(/^(\d+\.\d+)\.0$/, '$1');

/** Where the data is and what leaves the computer: plain answers. */
const LOCAL: [string, string][] = [
  ['Where is my data?', 'In a folder you choose on your disk. IsoStride reads the FIT files there and writes what it computes next to them, in .isostride/, as JSON files you can open, copy or delete.'],
  ['What is sent to a server?', 'Nothing. There is no server and no account. The app is a static web page; your files are read by your browser and never uploaded. The map background is the one thing that needs the network, and it is off until you switch it on.'],
  ['Can I check that?', 'Yes. The code is on GitHub, with its tests. You can read it, build it and run it yourself.'],
  ['Which watches?', 'Any watch that exports FIT files. It is tested on files from COROS and Garmin; files from Suunto, Wahoo or Polar should read too, and if one does not, an issue with the file helps.'],
];

/** What the analysis of metrics covers. */
const METRICS: [string, string][] = [
  ['A single run', 'Up to four metrics on one chart, with your zones, the laps and the map. Select any part of the run to get its minimum, average and maximum.'],
  ['Segments', 'A route you run often, the laps of a workout, or a rule you write, such as the fastest 5 minutes with the heart rate above 160. The app finds every occurrence in your runs.'],
  ['Change over time', 'A metric on one segment across months, with a fitted trend, the variation between efforts and a 95% interval. A change is reported only when it is larger than that variation.'],
  ['A/B comparison', 'The same segment split by shoes, heart rate sensor, watch or workout type.'],
  ['Export', 'Every segment with its metrics and context as CSV.'],
];

/** The performance models, each with the method it is taken from. */
const MODELS: [string, string][] = [
  ['Training load of a run', 'Banister TRIMP (1991), Edwards TRIMP (1993), rTSS, power TSS'],
  ['Fitness, fatigue and form', 'Banister’s impulse-response model (CTL, ATL, TSB), also fitted to your own results'],
  ['Critical speed and D′, critical power and W′', 'Monod and Scherrer (1965)'],
  ['Race time predictions', 'Riegel’s power law (1981)'],
  ['VO2max', 'From heart rate, and VDOT after Daniels and Gilbert (1979)'],
  ['Intensity distribution', 'Time in heart rate zones; low, moderate and high after Seiler'],
  ['Aerobic efficiency', 'Efficiency factor and pace to heart rate decoupling'],
];

export default function Home() {
  return (
    <>
      <header className="top">
        <a className="brand" href="/" aria-label="IsoStride, home">
          <Logo size={26} />
          <span>IsoStride</span>
        </a>
        <nav aria-label="Sections">
          <a href="#why">Why</a>
          <a href="#local">Local and open source</a>
          <a href="#metrics">Metrics</a>
          <a href="#models">Models</a>
          <a href="#open">Open platform</a>
        </nav>
        <a className="btn primary" href={APP_URL}>Open the app</a>
        <a className="gh" href={REPO_URL} aria-label="Source on GitHub" title="Source on GitHub">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
      </header>

      <main>
        <section className="hero">
          <h1>IsoStride is an open platform for analysing your runs.</h1>
          <p className="lead">
            It reads the FIT files your watch exports and analyses their metrics in your browser. It is open source, so you can add your own models and analyses. There is no account and no cloud: the files, and everything computed from them, stay in a folder on your disk.
          </p>
          <p className="facts">Free, MIT licence · <a href={REPO_URL}>source on GitHub</a> · Chrome, Edge or Opera on a desktop</p>
        </section>

        <div className="shots hero-shot">
          <Shot name="dashboard" wide eager alt="The Dashboard of IsoStride: this week's running, form, the last run, fitness and fatigue, critical speed and recent runs.">
            The Dashboard. The screens on this page show demo data of a made-up runner with a critical speed of about 3:15 /km; click one to open it full size.
          </Shot>
        </div>

        <section id="why" className="section">
          <h2>Why it exists</h2>
          <div className="prose">
            <p>
              Most running apps are training logs. They record what you did: the calendar, the weekly totals, the plan. Their tools for analysing and comparing the data are limited.
            </p>
            <p>
              The tools that go deeper are mostly closed services: you upload your runs, you cannot see how a figure is computed, and you cannot add a model of your own. Open tools of this kind for running are hard to find.
            </p>
            <p>
              IsoStride is built for that part only. You can look at any metric in the file, follow the same segment across months, compare one group of efforts with another, and run the performance models on your own history, with the code open and the data on your disk.
            </p>
            <p>
              It does not replace your training log. It does not plan training, does not sync with your watch and has no feed or sharing. Keep your log where it is, and export the FIT files when you want to analyse them.
            </p>
          </div>
        </section>

        <section id="local" className="section data">
          <div>
            <h2>Local and open source</h2>
            <p className="lead small">Runs are health data, with the places where you live and train. IsoStride is built so that they never leave your computer.</p>
            <LocalDiagram />
          </div>
          <dl>
            {LOCAL.map(([q, a]) => (
              <div key={q}>
                <dt>{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="metrics" className="section">
          <h2>Analysis of metrics</h2>
          <p className="lead small intro">
            Every numeric field in the file is a metric: pace, heart rate, cadence, ground contact time, vertical oscillation, step length, power, and whatever else your watch or its apps record, for example COROS Form Power, Garmin stance time balance or the fields of Stryd.
          </p>
          <dl className="rows">
            {METRICS.map(([title, text]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <div className="shots">
            <Shot name="run" wide alt="A run in IsoStride: pace, heart rate, cadence and ground contact time of an interval session on one chart, with the laps and the map beside it.">
              A run: an interval session of 6 × 1 km, four metrics on one chart, the laps and the route.
            </Shot>
            <Shot name="trend" wide alt="The Compare screen: the pace and ground contact time of every 1 km repetition over five months, with trend lines and the table of changes.">
              A segment over time: every 1 km repetition over five months, with the trend and the table of changes.
            </Shot>
            <Shot name="ab" wide alt="The A/B tab of Compare: ground contact time of the 1 km repetitions in two pairs of shoes, with the difference and its interval.">
              A/B: the same repetitions in two pairs of shoes, with the difference, its 95% interval and a warning that the comparison is not a fair one.
            </Shot>
          </div>
        </section>

        <section id="models" className="section">
          <h2>Performance models</h2>
          <p className="lead small intro">
            The models are published ones, not IsoStride’s own. Each one names its method, shows the inputs it used, and says which of its assumptions your data meets and which it does not.
          </p>
          <table className="models">
            <thead>
              <tr><th scope="col">What</th><th scope="col">Method</th></tr>
            </thead>
            <tbody>
              {MODELS.map(([what, method]) => (
                <tr key={what}><th scope="row">{what}</th><td>{method}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="shots">
            <Shot name="critical" alt="The Performance screen: critical speed and critical power over five months, fitted to the best efforts.">
              Critical speed and D′, critical power and W′, fitted to the best efforts of the last 90 days.
            </Shot>
            <Shot name="form" alt="The Performance screen: daily load, fitness, fatigue and form over time.">
              Fitness, fatigue and form from the load of every run.
            </Shot>
          </div>
        </section>

        <section id="open" className="section">
          <h2>An open platform</h2>
          <div className="prose">
            <p>
              IsoStride is meant to be built on. The code is open, and the models and analyses are ordinary TypeScript modules with tests, not a closed engine. If a model you use is missing, or you want to analyse your data in a way the app does not, you can add it.
            </p>
          </div>
          <dl className="rows open-rows">
            <div>
              <dt>Your own model</dt>
              <dd>The performance models are in <code>apps/app/lib/load</code> and <code>lib/curve</code>. A new one is added the same way: it states its inputs and assumptions, and gets its view on the Performance screen.</dd>
            </div>
            <div>
              <dt>Your own analysis</dt>
              <dd>Trends, A/B comparisons and their statistics are in <code>lib/compare</code> and <code>lib/stats</code>; the rules that find segments are in <code>lib/blocks</code> and <code>lib/detection</code>.</dd>
            </div>
            <div>
              <dt>Your own metrics</dt>
              <dd>Nothing to write: every numeric field in a FIT file, also from apps on your watch, becomes a metric by itself.</dd>
            </div>
          </dl>
          <div className="invite">
            <div>
              <h3>Contributions are welcome</h3>
              <p>
                Code or ideas, both help. If you have written a model or an analysis, open a pull request. If you only know what is missing, a model you rely on, a comparison you would like to make, a watch whose files do not read well, describe it in an issue. You do not need to write code to take part.
              </p>
            </div>
            <div className="invite-links">
              <a className="btn" href={`${REPO_URL}/issues/new`}>Suggest an idea</a>
              <a className="btn" href={`${REPO_URL}/pulls`}>Open a pull request</a>
            </div>
          </div>
        </section>

        <section className="section closing">
          <h2>Getting started</h2>
          <ol className="start">
            <li>Export your runs as FIT files (COROS: Training Hub, Export; Garmin Connect: Export Original) and put them in one folder.</li>
            <li>Open <a href={APP_URL}>{APP_HOST}</a> in Chrome, Edge or Opera on a desktop. Safari and Firefox cannot give a web page access to a folder.</li>
            <li>Choose the folder and import. To run the app yourself, clone the <a href={REPO_URL}>repository</a> and run <code>npm install</code>, then <code>npm run dev</code>.</li>
          </ol>
        </section>
      </main>

      <footer className="foot">
        <span>© {new Date().getFullYear()} IsoStride {VERSION} · <a href={REPO_URL}>source on GitHub</a> (MIT) · <a href={`${REPO_URL}/blob/master/CHANGELOG.md`}>changelog</a></span>
        <a href={APP_URL}>{APP_HOST}</a>
      </footer>
    </>
  );
}
