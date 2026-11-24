import type { Metadata } from 'next';
import { APP_HOST, APP_URL } from './links';
import './globals.css';

export const metadata: Metadata = { title: 'IsoStride · not here' };

/**
 * The page for an address the site does not have (served as 404.html). The site has a root layout per
 * language, so this page stands alone; it says so in both languages.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main className="missing">
          <h1>Not here</h1>
          <p>This page does not exist. The app is at <a href={APP_URL}>{APP_HOST}</a>.</p>
          <p lang="pl">Tej strony nie ma. Aplikacja jest pod adresem <a href={APP_URL}>{APP_HOST}</a>.</p>
          <a className="btn" href="/">IsoStride</a>
        </main>
      </body>
    </html>
  );
}
