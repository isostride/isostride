import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** A CloudFront Function of infra/functions, run as CloudFront runs it: its handler on a viewer request. */
type Request = { uri: string; headers: Record<string, { value: string }>; querystring: Record<string, { value: string; multiValue?: { value: string }[] }> };
const load = (name: string) => new Function(`${fs.readFileSync(path.resolve(__dirname, `../../../../infra/functions/${name}.js`), 'utf8')}; return handler;`)() as (e: { request: Request }) => Request & { statusCode?: number; headers: Record<string, { value: string }> };
const request = (uri: string, host: string, querystring: Request['querystring'] = {}) => ({ request: { uri, headers: { host: { value: host } }, querystring } });

describe('App and site served from AWS', () => {
  it('Paths of the static export served', () => {
    // The app at app.<domain>: its pages as the export lays them out, its files as they are.
    const app = load('app');
    const uri = (u: string) => app(request(u, 'app.isostride.com')).uri;
    expect(['/', '/run', '/run/', '/settings', '/run.txt', '/_next/static/chunks/a.js', '/icon.svg'].map(uri))
      .toEqual(['/index.html', '/run.html', '/run.html', '/settings.html', '/run.txt', '/_next/static/chunks/a.js', '/icon.svg']);
    // The site at <domain>: the same, and www sent to the bare domain with the query kept.
    const site = load('site');
    expect(site(request('/about', 'isostride.com')).uri).toBe('/about.html');
    const moved = site(request('/pricing', 'www.isostride.com', { a: { value: '1' }, b: { value: '', multiValue: [{ value: 'x' }, { value: 'y' }] } }));
    expect(moved.statusCode).toBe(301);
    expect(moved.headers.location.value).toBe('https://isostride.com/pricing?a=1&b=x&b=y');
  });
});
