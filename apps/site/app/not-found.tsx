import { APP_HOST, APP_URL } from './links';

export default function NotFound() {
  return (
    <main className="missing">
      <h1>Not here</h1>
      <p>This page does not exist. The app is at <a href={APP_URL}>{APP_HOST}</a>.</p>
      <a className="btn" href="/">IsoStride</a>
    </main>
  );
}
