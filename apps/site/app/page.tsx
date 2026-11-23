import { Logo } from './Logo';
import { APP_HOST, APP_URL } from './links';

const STEPS = [
  ['Choose your folder', "Point Isostride at the folder your watch's FIT files are in. It reads them in your browser: nothing is uploaded."],
  ['It finds your segments', 'Routes you run again, efforts of the same length, laps of the same session: found in your runs, kept as segments.'],
  ['Compare like with like', 'Each segment over time, in the same context of pace, heat and fatigue, so a real change stands out from the noise.'],
];

const FEATURES = [
  ['Segments and efforts', 'The same stretch of road or the same effort across months of runs, pace, heart rate and running form side by side.'],
  ['Performance you can trust', 'Load, form, critical speed and power, VO2max: each model says what it rests on and how far to trust it today.'],
  ['A dashboard of your own', "This week, your form, a segment's trend, any chart pinned from the app: the things that matter to you, at a glance."],
];

export default function Home() {
  return (
    <>
      <header className="top">
        <a className="brand" href="/" aria-label="Isostride">
          <Logo size={30} />
          <span>Iso<i>stride</i></span>
        </a>
        <a className="btn" href={APP_URL}>Open the app</a>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">For runners who read their data</p>
          <h1>See what your watch averages hide.</h1>
          <p className="lead">Isostride compares the same segments of your runs in the same context, so you see whether you are really getting faster, fitter and more efficient.</p>
          <div className="cta">
            <a className="btn primary" href={APP_URL}>Open Isostride</a>
            <span className="muted">Free · runs in Chrome, Edge or Opera on your computer</span>
          </div>
        </section>

        <section className="steps" aria-label="How it works">
          <h2>How it works</h2>
          <ol>
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <span className="num">{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="features" aria-label="What you get">
          {FEATURES.map(([title, text]) => (
            <article key={title} className="card">
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>

        <section className="privacy card">
          <h2>Your data stays with you</h2>
          <p>Your runs are health data. Isostride has no server and no account: it reads your FIT files in your browser and keeps what it works out in the same folder, on your computer. Nothing leaves it.</p>
          <a className="btn primary" href={APP_URL}>Choose your folder and start</a>
        </section>
      </main>

      <footer className="foot">
        <span>© {new Date().getFullYear()} Isostride</span>
        <a href={APP_URL}>{APP_HOST}</a>
      </footer>
    </>
  );
}
