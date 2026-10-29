import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { XtreamAccountCheck } from './xtream-account-check.js';

/** The real check, except that this test's own server on 127.0.0.1 counts as a provider. */
class LocalProviderCheck extends XtreamAccountCheck {
  protected override isBlocked(address: string, family: number): boolean {
    return address === '127.0.0.1' ? false : super.isBlocked(address, family);
  }
}

describe('XtreamAccountCheck', () => {
  let server: Server;
  let base: string;
  let reply: (url: URL) => { status: number; body: string; headers?: Record<string, string> };
  const asked: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      asked.push(url.pathname + url.search);
      const answer = reply(url);
      res.writeHead(answer.status, answer.headers ?? { 'content-type': 'application/json' });
      res.end(answer.body);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('asks player_api.php and returns only the account fields', async () => {
    reply = () => ({
      status: 200,
      body: JSON.stringify({
        user_info: {
          username: 'u1',
          password: 'secret',
          status: 'Active',
          exp_date: '1893456000',
          active_cons: '1',
          max_connections: '2',
          message: 'Welcome',
        },
        server_info: { url: 'internal.example', port: '8080' },
      }),
    });
    const result = await new LocalProviderCheck().check({
      server: `${base}/get.php`,
      username: 'u1',
      password: 'secret',
    });
    expect(result).toEqual({
      ok: true,
      account: {
        username: 'u1',
        status: 'Active',
        expiresAt: new Date(1893456000 * 1000),
        activeConnections: 1,
        maxConnections: 2,
        message: 'Welcome',
      },
    });
    expect(asked.at(-1)).toBe('/player_api.php?username=u1&password=secret');
  });

  it('refuses loopback and private addresses without calling them', async () => {
    const before = asked.length;
    const check = new XtreamAccountCheck();
    for (const server of [base, 'http://10.1.2.3:8080', 'http://192.168.1.10', 'http://[::1]:80']) {
      expect(await check.check({ server, username: 'u', password: 'p' })).toEqual({
        ok: false,
        reason: 'blocked',
      });
    }
    expect(asked.length).toBe(before);
  });

  it('lets public addresses through, IPv4 and IPv6', () => {
    const check = new (class extends XtreamAccountCheck {
      blockedFor = (address: string, family: number) => this.isBlocked(address, family);
    })();
    expect(check.blockedFor('172.67.69.73', 4)).toBe(false);
    expect(check.blockedFor('8.8.8.8', 4)).toBe(false);
    expect(check.blockedFor('2606:4700::6810:84e5', 6)).toBe(false);
    expect(check.blockedFor('172.16.0.1', 4)).toBe(true);
    expect(check.blockedFor('::ffff:127.0.0.1', 6)).toBe(true);
  });

  it('refuses other schemes and a missing login', async () => {
    const check = new LocalProviderCheck();
    expect(await check.check({ server: 'ftp://x.example', username: 'u', password: 'p' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await check.check({ server: base, username: '', password: 'p' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('does not follow redirects', async () => {
    reply = () => ({ status: 302, body: '', headers: { location: 'http://10.0.0.1/' } });
    expect(
      await new LocalProviderCheck().check({ server: base, username: 'u', password: 'p' }),
    ).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('refuses an answer that is not an account, or too big', async () => {
    reply = () => ({ status: 200, body: '{"user_info":null}' });
    expect(
      (await new LocalProviderCheck().check({ server: base, username: 'u', password: 'p' })).ok,
    ).toBe(false);
    reply = () => ({ status: 200, body: 'x'.repeat(300 * 1024) });
    expect(
      await new LocalProviderCheck().check({ server: base, username: 'u', password: 'p' }),
    ).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });
});
