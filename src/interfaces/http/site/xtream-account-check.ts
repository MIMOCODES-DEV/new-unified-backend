import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { Injectable } from '@nestjs/common';

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 256 * 1024;

/** Addresses a visitor must never make the server call: loopback, private, link-local, … */
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export interface XtreamAccount {
  readonly username: string | null;
  readonly status: string | null;
  readonly expiresAt: Date | null;
  readonly activeConnections: number | null;
  readonly maxConnections: number | null;
  readonly message: string | null;
}

export type XtreamCheck =
  | { readonly ok: true; readonly account: XtreamAccount }
  | { readonly ok: false; readonly reason: 'invalid' | 'blocked' | 'unreachable' | 'refused' };

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/**
 * The site's "check playlist": asks an Xtream provider about an account (`player_api.php`) and
 * returns only the account fields. The server makes the call, so it is guarded: http or https only,
 * public addresses only (the address checked is the one connected to), no redirects, 10 seconds,
 * 256 KB.
 */
@Injectable()
export class XtreamAccountCheck {
  async check(input: { server: string; username: string; password: string }): Promise<XtreamCheck> {
    let url: URL;
    try {
      url = new URL(input.server.trim());
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !input.username ||
      !input.password
    ) {
      return { ok: false, reason: 'invalid' };
    }
    const base = url.pathname.replace(/\/(get|player_api)\.php$/i, '').replace(/\/+$/, '');
    url = new URL(`${url.origin}${base}/player_api.php`);
    url.searchParams.set('username', input.username);
    url.searchParams.set('password', input.password);

    const host = url.hostname.replace(/^\[|\]$/g, '');
    let address: { address: string; family: number };
    try {
      address = isIP(host)
        ? { address: host, family: isIP(host) }
        : await lookup(host, { verbatim: true });
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
    if (this.isBlocked(address.address, address.family)) {
      return { ok: false, reason: 'blocked' };
    }

    const body = await this.get(url, address).catch(() => null);
    if (body === null) return { ok: false, reason: 'unreachable' };
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return { ok: false, reason: 'refused' };
    }
    const info = (json as { user_info?: Record<string, unknown> } | null)?.user_info;
    if (!info || typeof info !== 'object') return { ok: false, reason: 'refused' };
    const expires = num(info.exp_date);
    return {
      ok: true,
      account: {
        username: str(info.username),
        status: str(info.status),
        expiresAt: expires ? new Date(expires * 1000) : null,
        activeConnections: num(info.active_cons),
        maxConnections: num(info.max_connections),
        message: str(info.message),
      },
    };
  }

  /** Whether the server may not call this address (loopback, private, link-local, …). */
  protected isBlocked(address: string, family: number): boolean {
    return blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
  }

  /** GET to the checked address only (pinned lookup); null on anything but a 200 within limits. */
  private get(url: URL, address: { address: string; family: number }): Promise<string | null> {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const req = send(
        url,
        {
          method: 'GET',
          timeout: TIMEOUT_MS,
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          // Connects to the address checked above, never to a second DNS answer.
          lookup: (_host, options, callback) => {
            const done = callback as (e: null, a: unknown, f?: number) => void;
            if ((options as { all?: boolean }).all) done(null, [address]);
            else done(null, address.address, address.family);
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            resolve(null);
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              req.destroy();
              resolve(null);
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end();
    });
  }
}
