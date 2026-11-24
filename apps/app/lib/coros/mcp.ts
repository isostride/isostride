import { CorosError, renewTokens, type CorosConnection } from './oauth';

/**
 * The tools of COROS's MCP server, called over MCP's Streamable HTTP from the browser (ADR "COROS
 * through its MCP server"): an initialize, then tools/call, each a JSON-RPC request answered in JSON
 * or as a stream of server-sent events. An access token that has ended is renewed once, by itself,
 * and the connection saved with its new tokens.
 */

const PROTOCOL = '2025-06-18';

type Fetch = typeof fetch;

/** What a tool answered: its text, and whether COROS calls it an error (a limit, a run in progress). */
export interface ToolAnswer {
  text: string;
  isError: boolean;
}

/** A tool of COROS called with its arguments; what the fetch of runs needs of the MCP server. */
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<ToolAnswer>;

interface RpcMessage {
  id?: number;
  result?: { content?: { type: string; text?: string }[]; isError?: boolean };
  error?: { code: number; message: string };
}

/** The JSON-RPC answer of the given id, from a JSON body or a stream of server-sent events. */
export function readRpc(contentType: string, body: string, id: number): RpcMessage | null {
  const messages: RpcMessage[] = [];
  if (contentType.includes('text/event-stream')) {
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) messages.push(JSON.parse(data) as RpcMessage);
    }
  } else if (body.trim()) {
    const parsed = JSON.parse(body) as RpcMessage | RpcMessage[];
    messages.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return messages.find((m) => m.id === id) ?? null;
}

export class CorosMcp {
  private nextId = 1;
  private session: string | null = null;
  private ready: Promise<void> | null = null;

  /**
   * @param conn the connected account; replaced by one with new tokens when they are renewed
   * @param saved called with the connection whenever its tokens were renewed, to keep them
   */
  constructor(
    private conn: CorosConnection,
    private readonly saved: (conn: CorosConnection) => Promise<void>,
    private readonly fetchFn: Fetch = fetch,
    private readonly appVersion = '0',
  ) {}

  private async post(message: object, renewed = false): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.conn.tokens.access}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL,
    };
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    let res: Response;
    try {
      // Called as a plain function: the browser's fetch refuses to run as a method of another object.
      const fetchFn = this.fetchFn;
      res = await fetchFn(this.conn.server.resource, { method: 'POST', headers, body: JSON.stringify(message) }); // i18n-ignore: a protocol word or a kind of failure, not shown
    } catch (e) {
      throw new CorosError('network', e instanceof Error ? e.message : String(e)); // i18n-ignore: a protocol word or a kind of failure, not shown
    }
    if (res.status === 401 && !renewed) {
      this.conn = { ...this.conn, tokens: await renewTokens(this.conn, this.fetchFn) };
      await this.saved(this.conn);
      return this.post(message, true);
    }
    // i18n-ignore: the detail of a failure, read by the screen through its kind
    if (res.status === 401) throw new CorosError('auth', 'COROS no longer accepts the sign-in');
    if (!res.ok && res.status !== 202) throw new CorosError('refused', (await res.text()) || `HTTP ${res.status}`); // i18n-ignore: a protocol word or a kind of failure, not shown
    const session = res.headers.get('Mcp-Session-Id');
    if (session) this.session = session;
    return res;
  }

  private async request(method: string, params: object): Promise<NonNullable<RpcMessage['result']>> {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params });
    const answer = readRpc(res.headers.get('Content-Type') ?? '', await res.text(), id);
    // i18n-ignore: the detail of a failure, read by the screen through its kind
    if (!answer) throw new CorosError('refused', `COROS gave no answer to ${method}`);
    if (answer.error) throw new CorosError('refused', answer.error.message); // i18n-ignore: a protocol word or a kind of failure, not shown
    return answer.result ?? {};
  }

  private start(): Promise<void> {
    this.ready ??= (async () => {
      await this.request('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'IsoStride', version: this.appVersion } });
      await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    })().catch((e) => {
      this.ready = null;
      throw e;
    });
    return this.ready;
  }

  /** Calls a tool of COROS; its text content joined. */
  call: CallTool = async (name, args) => {
    await this.start();
    const result = await this.request('tools/call', { name, arguments: args });
    const text = (result.content ?? [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');
    return { text, isError: !!result.isError };
  };
}
