import { CONTENT, HREF, SHOTS, type Lang } from './content';
import { LocalDiagram } from './LocalDiagram';
import { Logo } from './Logo';
import { Shot } from './Shot';
import { APP_URL, REPO_URL } from './links';

/** The version of the app deployed with the site (its build reads it from package.json), a patch of 0 left out. */
const VERSION = (process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0').replace(/^(\d+\.\d+)\.0$/, '$1');

/** The home page of the site in a language (requirement "Site in English and Polish"). */
export function Home({ lang }: { lang: Lang }) {
  const c = CONTENT[lang];
  const other: Lang = lang === 'en' ? 'pl' : 'en';
  return (
    <>
      <header className="top">
        <a className="brand" href={HREF[lang]} aria-label={c.home}>
          <Logo size={26} />
          <span>IsoStride</span>
        </a>
        <nav aria-label={c.sections}>
          {c.nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
        <a className="btn primary" href={APP_URL}>{c.openApp}</a>
        {/* The page in the other language; the choice is kept (?lang=…, read by the head script). */}
        <a className="lang" href={`${HREF[other]}?lang=${other}`} hrefLang={other} lang={other} aria-label={`${c.other.short}, ${c.other.name}`} title={c.other.name}>{c.other.short}</a>
        <a className="gh" href={REPO_URL} aria-label={c.source} title={c.source}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>
      </header>

      <main>
        <section className="hero">
          {/* The name in the colours of the logo, the rest of the sentence as it is. */}
          <h1>{c.hero.h1.startsWith('IsoStride') ? <><span className="wordmark">IsoStride</span>{c.hero.h1.slice('IsoStride'.length)}</> : c.hero.h1}</h1>
          <p className="lead">{c.hero.lead}</p>
          <p className="facts">{c.hero.facts}</p>
        </section>

        <div className="shots hero-shot">
          <Shot name="dashboard" dir={SHOTS[lang]} wide eager alt={c.heroShot.alt} open={c.openFull}>{c.heroShot.caption}</Shot>
        </div>

        <section id="why" className="section">
          <h2>{c.why.h2}</h2>
          <div className="prose">
            {c.why.paragraphs.map((p) => <p key={p}>{p}</p>)}
          </div>
        </section>

        <section id="local" className="section data">
          <div>
            <h2>{c.local.h2}</h2>
            <p className="lead small">{c.local.lead}</p>
            <LocalDiagram text={c.diagram} />
          </div>
          <dl>
            {c.local.qa.map(([q, a]) => (
              <div key={q}>
                <dt>{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="metrics" className="section">
          <h2>{c.metrics.h2}</h2>
          <p className="lead small intro">{c.metrics.lead}</p>
          <dl className="rows">
            {c.metrics.rows.map(([title, text]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <div className="shots">
            {c.metrics.shots.map(([name, alt, caption]) => <Shot key={name} name={name} dir={SHOTS[lang]} wide alt={alt} open={c.openFull}>{caption}</Shot>)}
          </div>
        </section>

        <section id="models" className="section">
          <h2>{c.models.h2}</h2>
          <p className="lead small intro">{c.models.lead}</p>
          <table className="models">
            <thead>
              <tr><th scope="col">{c.models.what}</th><th scope="col">{c.models.method}</th></tr>
            </thead>
            <tbody>
              {c.models.rows.map(([what, method]) => (
                <tr key={what}><th scope="row">{what}</th><td>{method}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="shots">
            {c.models.shots.map(([name, alt, caption]) => <Shot key={name} name={name} dir={SHOTS[lang]} alt={alt} open={c.openFull}>{caption}</Shot>)}
          </div>
        </section>

        <section id="open" className="section">
          <h2>{c.open.h2}</h2>
          <div className="prose">
            <p>{c.open.lead}</p>
          </div>
          <dl className="rows open-rows">
            {c.open.rows.map(([title, text]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <div className="invite">
            <div>
              <h3>{c.open.invite.h3}</h3>
              <p>{c.open.invite.text}</p>
            </div>
            <div className="invite-links">
              <a className="btn" href={`${REPO_URL}/issues/new`}>{c.open.invite.idea}</a>
              <a className="btn" href={`${REPO_URL}/pulls`}>{c.open.invite.pr}</a>
            </div>
          </div>
        </section>

        <section className="section closing">
          <h2>{c.start.h2}</h2>
          <ol className="start">
            {c.start.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </section>
      </main>

      <footer className="foot">
        <span>© {new Date().getFullYear()} IsoStride {VERSION} · {c.foot.source} · <a href={VERSION === '0.0.0' ? `${REPO_URL}/releases` : `${REPO_URL}/releases/tag/v${VERSION}`}>{c.foot.notes}</a></span>
        <a href={APP_URL}>{new URL(APP_URL).host}</a>
      </footer>
    </>
  );
}
