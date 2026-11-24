/**
 * The runner's COROS account, connected through COROS's own sign-in (requirement "COROS account
 * connected", ADR "COROS through its MCP server"): OAuth 2.0 with PKCE against the authorization
 * server of COROS's MCP server, IsoStride registered as a public client (no secret) on the first
 * connect. Everything here runs in the browser; nothing passes through a server of IsoStride's.
 */

/** COROS's MCP server; it sends each runner to the servers of their region (mcpeu, mcpus, mcpcn). */
export const COROS_MCP = 'https://mcp.coros.com/mcp';
/** What IsoStride asks of the account: the MCP tools, and a renewal so the runner signs in once. */
export const COROS_SCOPE = 'openid mcp.tools offline_access';

type Fetch = typeof fetch;

/** The channel COROS's sign-in window answers on (app/coros): same origin, whatever COROS does to the window's opener. */
export const COROS_CHANNEL = 'isostride-coros';

/** What COROS's sign-in window sent back. */
export interface SignInAnswer {
  state: string | null;
  code: string | null;
  error: string | null;
}

/** The endpoints of the runner's region, read from COROS's metadata. */
export interface CorosServer {
  /** the MCP endpoint, also the resource the tokens are for */
  resource: string;
  issuer: string;
  authorize: string;
  token: string;
  register: string;
  revoke: string | null;
}

export interface CorosTokens {
  access: string;
  refresh: string | null;
  /** when the access token ends, ms since the epoch */
  expiresAt: number;
}

/** A connected account as kept in this browser (never in the data folder). */
export interface CorosConnection {
  server: CorosServer;
  clientId: string;
  redirectUri: string;
  tokens: CorosTokens;
  /** when it was connected, ISO */
  connectedAt: string;
}

/** Why a call to COROS failed: the sign-in is no longer valid, COROS refused, or it could not be reached. */
export type CorosErrorKind = 'auth' | 'refused' | 'network';

/** A failure of COROS, with COROS's own words when it gave any. */
export class CorosError extends Error {
  constructor(readonly kind: CorosErrorKind, readonly detail: string) {
    super(detail);
    this.name = 'CorosError';
  }
}

async function getJson<T>(fetchFn: Fetch, url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (e) {
    throw new CorosError('network', e instanceof Error ? e.message : String(e)); // i18n-ignore: a protocol word or a kind of failure, not shown
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Not JSON: its text is the detail of the failure below.
  }
  if (!res.ok) {
    const detail = String(body.error_description ?? body.error ?? (text || `HTTP ${res.status}`));
    throw new CorosError(res.status === 401 || body.error === 'invalid_grant' ? 'auth' : 'refused', detail); // i18n-ignore: a protocol word or a kind of failure, not shown
  }
  return body as T;
}

/** The runner's region and its endpoints, from the metadata of COROS's MCP server (RFC 9728, RFC 8414). */
export async function discoverCoros(fetchFn: Fetch = fetch, mcp = COROS_MCP): Promise<CorosServer> {
  const url = new URL(mcp);
  const resource = await getJson<{ resource: string; authorization_servers: string[] }>(fetchFn, `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`);
  const issuer = resource.authorization_servers[0];
  const meta = await getJson<{ issuer: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint?: string; revocation_endpoint?: string }>(
    fetchFn,
    `${issuer}/.well-known/oauth-authorization-server`,
  );
  // i18n-ignore: a failure of COROS's metadata, shown as COROS's detail
  if (!meta.registration_endpoint) throw new CorosError('refused', 'COROS offers no client registration');
  return {
    resource: resource.resource,
    issuer: meta.issuer,
    authorize: meta.authorization_endpoint,
    token: meta.token_endpoint,
    register: meta.registration_endpoint,
    revoke: meta.revocation_endpoint ?? null,
  };
}

/** Registers IsoStride with COROS as a public client for this address of the app (RFC 7591); its client id. */
export async function registerClient(server: CorosServer, redirectUri: string, fetchFn: Fetch = fetch): Promise<string> {
  const body = await getJson<{ client_id: string }>(fetchFn, server.register, {
    method: 'POST', // i18n-ignore: a protocol word or a kind of failure, not shown
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'IsoStride',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: COROS_SCOPE,
    }),
  });
  return body.client_id;
}

const base64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A random value for the state or the PKCE verifier. */
export const randomToken = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)));

/** A PKCE pair (RFC 7636, S256). */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** The address of COROS's sign-in, where the runner allows IsoStride. */
export function authorizeUrl(server: CorosServer, clientId: string, redirectUri: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: COROS_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: server.resource,
  });
  return `${server.authorize}?${q}`;
}

interface TokenBody { access_token: string; refresh_token?: string; expires_in?: number }

const tokensOf = (b: TokenBody, previous: string | null, now: number): CorosTokens => ({
  access: b.access_token,
  // COROS gives a new renewal with each renewal; one not given keeps the one before.
  refresh: b.refresh_token ?? previous,
  // 30 days when COROS does not say (its FAQ).
  expiresAt: now + (b.expires_in ?? 30 * 86400) * 1000,
});

function tokenRequest(server: CorosServer, form: Record<string, string>, fetchFn: Fetch): Promise<TokenBody> {
  return getJson<TokenBody>(fetchFn, server.token, {
    method: 'POST', // i18n-ignore: a protocol word or a kind of failure, not shown
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

/** The tokens for the code COROS's sign-in gave back. */
export async function exchangeCode(server: CorosServer, clientId: string, redirectUri: string, code: string, verifier: string, fetchFn: Fetch = fetch, now = Date.now()): Promise<CorosTokens> {
  const body = await tokenRequest(server, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: server.resource }, fetchFn);
  return tokensOf(body, null, now);
}

/** New tokens from the renewal; a renewal COROS no longer takes is an 'auth' failure (connect again). */
export async function renewTokens(conn: CorosConnection, fetchFn: Fetch = fetch, now = Date.now()): Promise<CorosTokens> {
  // i18n-ignore: the detail of a failure, read by the screen through its kind
  if (!conn.tokens.refresh) throw new CorosError('auth', 'no renewal');
  const body = await tokenRequest(conn.server, { grant_type: 'refresh_token', refresh_token: conn.tokens.refresh, client_id: conn.clientId, resource: conn.server.resource }, fetchFn);
  return tokensOf(body, conn.tokens.refresh, now);
}

/** Tells COROS to forget the renewal (Disconnect); a failure is left unsaid, the browser forgets it anyway. */
export async function revokeTokens(conn: CorosConnection, fetchFn: Fetch = fetch): Promise<void> {
  if (!conn.server.revoke || !conn.tokens.refresh) return;
  await fetchFn(conn.server.revoke, {
    method: 'POST', // i18n-ignore: a protocol word or a kind of failure, not shown
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: conn.tokens.refresh, token_type_hint: 'refresh_token', client_id: conn.clientId }).toString(),
  }).catch(() => undefined);
}
