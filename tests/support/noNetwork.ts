import net from 'node:net';
import { afterAll, beforeAll } from 'vitest';

/**
 * Unit tests touch no network (ADR "A test pyramid"): any connection or fetch throws,
 * and each attempt is counted for the unit.network_calls metric.
 */
export let networkCalls = 0;
const connect = net.Socket.prototype.connect;
const fetch = globalThis.fetch;

beforeAll(() => {
  net.Socket.prototype.connect = function () {
    networkCalls++;
    throw new Error('unit tests touch no network');
  } as typeof connect;
  globalThis.fetch = (async () => {
    networkCalls++;
    throw new Error('unit tests touch no network');
  }) as typeof fetch;
});

afterAll(() => {
  net.Socket.prototype.connect = connect;
  globalThis.fetch = fetch;
});
