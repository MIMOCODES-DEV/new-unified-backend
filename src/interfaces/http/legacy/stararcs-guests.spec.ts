import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../../shared/config/app-config.js';
import { StarArcsGuests } from './stararcs-guests.js';

describe('StarArcsGuests', () => {
  let server: Server;
  let url: string;
  const seen: { token?: string; body: unknown }[] = [];
  let answer: { status: number; body: string } = { status: 200, body: '{"status":"success"}' };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let text = '';
      req.on('data', (c: Buffer) => (text += c.toString()));
      req.on('end', () => {
        seen.push({ token: req.headers['x-secret-token'] as string, body: JSON.parse(text) });
        res.statusCode = answer.status;
        res.end(answer.body);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const guests = (token?: string) =>
    new StarArcsGuests({ env: { STARARCS_URL: url, STARARCS_GUEST_TOKEN: token } } as AppConfig);

  it('registers the MAC under the app name with the key, and returns the reply as it is', async () => {
    answer = { status: 200, body: '{"status":"success","device":{"token":"t1"}}' };
    const reply = await guests('partner-key').register('aa:bb:cc:dd:ee:ff', 'iboplayer');
    expect(reply).toEqual({ status: 'success', device: { token: 't1' } });
    expect(seen.at(-1)).toEqual({
      token: 'partner-key',
      body: { DeviceMac: 'aa:bb:cc:dd:ee:ff', DeviceAppName: 'iboplayer' },
    });
  });

  it('gives null when StarArcs refuses or answers something that is not JSON', async () => {
    answer = { status: 422, body: '{"message":"The device app name field is required"}' };
    expect(await guests('partner-key').register('aa:bb:cc:dd:ee:ff', 'x')).toBeNull();
    answer = { status: 200, body: '<html>' };
    expect(await guests('partner-key').register('aa:bb:cc:dd:ee:ff', 'x')).toBeNull();
  });

  it('gives null without calling StarArcs when no key is set', async () => {
    const before = seen.length;
    expect(await guests(undefined).register('aa:bb:cc:dd:ee:ff', 'iboplayer')).toBeNull();
    expect(seen.length).toBe(before);
  });
});
