import { describe, expect, it } from 'vitest';
import { RECORDS, linkText } from '../support/coros';
import { CorosError, CorosMcp, authorizeUrl, discoverCoros, exchangeCode, pkcePair, registerClient, revokeTokens, isFitFile, readFitLinks, readRpc, readSportRecords, type CorosConnection, type CorosServer } from '@/lib/coros';

/**
 * COROS through its MCP server (ADR "COROS through its MCP server"): the text of its tools read as
 * COROS wrote it on 24 Nov 2026 (ids, places and coordinates made up), the metadata of its sign-in,
 * and the MCP client renewing an access token that has ended.
 */

const SERVER: CorosServer = {
  resource: 'https://mcpeu.coros.com/mcp',
  issuer: 'https://mcpeu.coros.com',
  authorize: 'https://mcpeu.coros.com/oauth2/authorize',
  token: 'https://mcpeu.coros.com/oauth2/token',
  register: 'https://mcpeu.coros.com/connect/register',
  revoke: 'https://mcpeu.coros.com/oauth2/revoke',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('COROS through its MCP server', () => {
  it('Activities and FIT links read out of the tools’ text', () => {
    expect(readSportRecords(RECORDS)).toEqual([
      { labelId: '100000000000000003', sportType: 100, date: '2026-11-23' },
      { labelId: '100000000000000002', sportType: 102, date: '2026-11-21' },
      { labelId: '100000000000000001', sportType: 900, date: '2026-11-20' },
    ]);
    expect(readFitLinks(linkText('200000000000000001_ab12cd34ef.fit'))).toEqual([
      { name: '200000000000000001_ab12cd34ef.fit', url: 'https://s3eu.coros.com/fit/v2/123/200000000000000001_ab12cd34ef.fit' },
    ]);
    // A name that would leave the folder is no file of COROS's.
    expect(readFitLinks('https://s3eu.coros.com/fit/%2E%2E%2Fevil.fit')).toEqual([]);
    expect(readFitLinks('This activity is still in progress; the FIT file is available after it ends.')).toEqual([]);
    const header = new Uint8Array(14);
    header.set([...'.FIT'].map((c) => c.charCodeAt(0)), 8);
    expect(isFitFile(header)).toBe(true);
    expect(isFitFile(new TextEncoder().encode('<html>not found</html>'))).toBe(false);
  });

  it('Sign-in found from COROS’s metadata', async () => {
    const asked: string[] = [];
    const fake = (async (url: string) => {
      asked.push(url);
      if (url.includes('oauth-protected-resource')) return json({ resource: SERVER.resource, authorization_servers: [SERVER.issuer] });
      return json({ issuer: SERVER.issuer, authorization_endpoint: SERVER.authorize, token_endpoint: SERVER.token, registration_endpoint: SERVER.register, revocation_endpoint: SERVER.revoke });
    }) as typeof fetch;
    expect(await discoverCoros(fake)).toEqual(SERVER);
    expect(asked).toEqual(['https://mcp.coros.com/.well-known/oauth-protected-resource/mcp', 'https://mcpeu.coros.com/.well-known/oauth-authorization-server']);
    const url = new URL(authorizeUrl(SERVER, 'client-1', 'http://localhost:3000/coros', 'challenge', 'state-1'));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ response_type: 'code', client_id: 'client-1', code_challenge_method: 'S256', state: 'state-1', resource: SERVER.resource, scope: 'openid mcp.tools offline_access' });
  });

  it('Answers read from JSON and from server-sent events', () => {
    const answer = { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'hi' }] } };
    expect(readRpc('application/json', JSON.stringify(answer), 2)).toEqual(answer);
    const stream = `event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: ${JSON.stringify(answer)}\n\n`;
    expect(readRpc('text/event-stream', stream, 2)).toEqual(answer);
    expect(readRpc('application/json', '', 2)).toBeNull();
  });

  it('Access token renewed by itself and kept', async () => {
    const conn: CorosConnection = { server: SERVER, clientId: 'client-1', redirectUri: 'http://localhost:3000/coros', connectedAt: '2026-11-24T10:00:00Z', tokens: { access: 'old', refresh: 'renew-1', expiresAt: 0 } };
    const seen: { url: string; auth: string | null; body: string }[] = [];
    // As the browser's fetch: it throws when called as a method of another object ("Illegal invocation").
    const fake = (async function (this: unknown, url: string, init: RequestInit) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      const auth = new Headers(init.headers).get('Authorization');
      seen.push({ url, auth, body: String(init.body) });
      if (url === SERVER.token) return json({ access_token: 'new', refresh_token: 'renew-2', expires_in: 2592000 });
      if (auth !== 'Bearer new') return new Response('', { status: 401 });
      const msg = JSON.parse(String(init.body)) as { id?: number; method: string };
      if (msg.id === undefined) return new Response(null, { status: 202 });
      if (msg.method === 'initialize') return json({ jsonrpc: '2.0', id: msg.id, result: {} }, 200, { 'Mcp-Session-Id': 's-1' });
      return new Response(`data: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: RECORDS }] } })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    }) as typeof fetch;
    const kept: CorosConnection[] = [];
    const mcp = new CorosMcp(conn, async (c) => { kept.push(c); }, fake);
    const answer = await mcp.call('querySportRecords', {});
    expect(answer).toEqual({ text: RECORDS, isError: false });
    expect(kept).toHaveLength(1);
    expect(kept[0].tokens).toMatchObject({ access: 'new', refresh: 'renew-2' });
    expect(new URLSearchParams(seen.find((s) => s.url === SERVER.token)!.body).get('grant_type')).toBe('refresh_token');
  });

  it('A renewal refused asks to connect again', async () => {
    const conn: CorosConnection = { server: SERVER, clientId: 'c', redirectUri: 'r', connectedAt: '', tokens: { access: 'old', refresh: 'gone', expiresAt: 0 } };
    const fake = (async (url: string) => (url === SERVER.token ? json({ error: 'invalid_grant', error_description: 'Refresh token expired' }, 400) : new Response('', { status: 401 }))) as typeof fetch;
    const mcp = new CorosMcp(conn, async () => undefined, fake);
    const error = await mcp.call('querySportRecords', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CorosError);
    expect(error).toMatchObject({ kind: 'auth', detail: 'Refresh token expired' });
  });

  it('Registered with COROS, signed in with PKCE, the renewal revoked at Disconnect', async () => {
    const seen: { url: string; body: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: String(init?.body ?? '') });
      if (url === SERVER.register) return json({ client_id: 'client-9' });
      if (url === SERVER.token) return json({ access_token: 'a-1', refresh_token: 'r-1' });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    expect(await registerClient(SERVER, 'http://localhost:3000/coros', fake)).toBe('client-9');
    // A public client: no secret, the code and the renewal only.
    expect(JSON.parse(seen[0].body)).toMatchObject({ redirect_uris: ['http://localhost:3000/coros'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] });
    const { verifier, challenge } = await pkcePair();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    expect(challenge).toBe(btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    // 30 days when COROS does not say how long the token lasts.
    const tokens = await exchangeCode(SERVER, 'client-9', 'http://localhost:3000/coros', 'code-1', verifier, fake, 1000);
    expect(tokens).toEqual({ access: 'a-1', refresh: 'r-1', expiresAt: 1000 + 30 * 86400 * 1000 });
    expect(Object.fromEntries(new URLSearchParams(seen[1].body))).toMatchObject({ grant_type: 'authorization_code', code: 'code-1', code_verifier: verifier, client_id: 'client-9' });
    await revokeTokens({ server: SERVER, clientId: 'client-9', redirectUri: 'r', connectedAt: '', tokens }, fake);
    expect(seen[2].url).toBe(SERVER.revoke);
    expect(new URLSearchParams(seen[2].body).get('token')).toBe('r-1');
  });

  it('COROS unreachable, refusing or offering no registration named as such', async () => {
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    await expect(discoverCoros(down)).rejects.toMatchObject({ kind: 'network', detail: 'Failed to fetch' });
    const noRegistration = (async (url: string) => (url.includes('oauth-protected-resource') ? json({ resource: SERVER.resource, authorization_servers: [SERVER.issuer] }) : json({ issuer: SERVER.issuer, authorization_endpoint: 'a', token_endpoint: 't' }))) as typeof fetch;
    await expect(discoverCoros(noRegistration)).rejects.toMatchObject({ kind: 'refused' });
    const refused = (async () => new Response('server error', { status: 500 })) as typeof fetch;
    await expect(registerClient(SERVER, 'r', refused)).rejects.toMatchObject({ kind: 'refused', detail: 'server error' });
    const conn: CorosConnection = { server: SERVER, clientId: 'c', redirectUri: 'r', connectedAt: '', tokens: { access: 'a', refresh: null, expiresAt: 0 } };
    // MCP: a network failure, a refusal, an error of the protocol, no answer at all.
    await expect(new CorosMcp(conn, async () => undefined, down).call('x', {})).rejects.toMatchObject({ kind: 'network' });
    await expect(new CorosMcp(conn, async () => undefined, refused).call('x', {})).rejects.toMatchObject({ kind: 'refused', detail: 'server error' });
    const rpcError = (async (_url: string, init: RequestInit) => {
      const msg = JSON.parse(String(init.body)) as { id?: number; method: string };
      if (msg.id === undefined) return new Response(null, { status: 202 });
      if (msg.method === 'initialize') return json({ jsonrpc: '2.0', id: msg.id, result: {} });
      return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Unknown tool: x' } });
    }) as typeof fetch;
    await expect(new CorosMcp(conn, async () => undefined, rpcError).call('x', {})).rejects.toMatchObject({ kind: 'refused', detail: 'Unknown tool: x' });
    const silent = (async () => json({ jsonrpc: '2.0', id: 999, result: {} })) as typeof fetch;
    await expect(new CorosMcp(conn, async () => undefined, silent).call('x', {})).rejects.toMatchObject({ kind: 'refused' });
    // No renewal kept: an ended token asks to connect again.
    const ended = (async () => new Response('', { status: 401 })) as typeof fetch;
    await expect(new CorosMcp(conn, async () => undefined, ended).call('x', {})).rejects.toMatchObject({ kind: 'auth' });
  });
});
