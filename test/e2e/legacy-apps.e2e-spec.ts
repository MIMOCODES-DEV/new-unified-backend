import 'reflect-metadata';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiModule } from '../../src/api.module.js';
import { encryptPassphrase } from '../../src/interfaces/legacy/codecs/aes-passphrase.codec.js';
import { signRequest } from '../../src/interfaces/legacy/codecs/hmac-signature.js';
import {
  appDecode,
  appEncode,
  cli,
  type E2eEnv,
  httpForm,
  httpPost,
  startE2eEnv,
} from './support/e2e-env.js';

interface CryptoJsSubset {
  AES: { decrypt(ciphertext: string, passphrase: string): { toString(encoding: unknown): string } };
  enc: { Utf8: unknown };
}
/** The apps decrypt responses with CryptoJS (no length limit; the 512 limit is for requests). */
const CryptoJS = createRequire(import.meta.url)('crypto-js') as CryptoJsSubset;

const CR_HOST = 'cr.test';
const BOB_HOST = 'bob.test';

/**
 * Fake old apps against the real server: the legacy TV playlist_info, the signed Android route,
 * Roku and the iOS/Android v2-v3 apps, each encoded the way the installed apps encode.
 * Brand `cr` keeps the default legacy profile; brand `bob` is switched to the bob profile.
 */
describe('old apps registration routes (e2e)', () => {
  let e2e: E2eEnv;
  let app: NestFastifyApplication;
  let port: number;

  async function playlistInfo(host: string, body: Record<string, unknown>) {
    const { data, key } = appEncode(body);
    const res = await httpForm(port, '/api/playlist_info', host, { data });
    const raw = (res.body as { data?: string }).data;
    return {
      status: res.status,
      outer: res.body as Record<string, unknown>,
      body: (raw ? appDecode(raw, key) : res.body) as Record<string, unknown>,
    };
  }

  function signedAndroid(host: string, body: Record<string, unknown>, signature?: string) {
    const data = encryptPassphrase(JSON.stringify(body), e2e.env.ANDROID_AES_NEW_SECRET ?? '');
    return httpPost(port, '/api/MBBPj5UwlCmTstXGb/android/playlist_information', host, {
      data,
      signature: signature ?? signRequest(e2e.env.ANDROID_SIGNING_SECRET ?? '', data),
    });
  }

  function decryptAndroid(body: unknown): Record<string, unknown> {
    const plain = CryptoJS.AES.decrypt(
      (body as { data: string }).data,
      e2e.env.ANDROID_AES_NEW_SECRET ?? '',
    ).toString(CryptoJS.enc.Utf8);
    return JSON.parse(plain) as Record<string, unknown>;
  }

  beforeAll(async () => {
    e2e = await startE2eEnv();
    expect((await cli(e2e.env, 'migrate:central')).exitCode).toBe(0);
    expect((await cli(e2e.env, 'tenant:create', 'cr', 'CR Player', CR_HOST)).exitCode).toBe(0);
    expect((await cli(e2e.env, 'tenant:create', 'bob', 'Bob Player', BOB_HOST)).exitCode).toBe(0);
    expect((await cli(e2e.env, 'migrate:tenants')).exitCode).toBe(0);

    Object.assign(process.env, e2e.env, { LOG_LEVEL: 'warn' });
    app = await NestFactory.create<NestFastifyApplication>(ApiModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app?.close();
    await e2e?.infra.stop();
  });

  it('device:legacy-profile shows and sets a brand profile', async () => {
    const shown = await cli(e2e.env, 'device:legacy-profile', 'bob');
    expect(shown).toEqual({ exitCode: 0, messages: ['bob legacy profile: cr'] });

    const set = await cli(e2e.env, 'device:legacy-profile', 'bob', 'bob');
    expect(set).toEqual({ exitCode: 0, messages: ['bob legacy profile set to bob'] });

    const bad = await cli(e2e.env, 'device:legacy-profile', 'bob', 'xyz');
    expect(bad.exitCode).toBe(1);
  });

  it('playlist_info registers a new TV device, then answers the same device again', async () => {
    const request = { mac_address: 'CC:00:00:00:10:01', app_type: 'samsung', version: '1.1.5' };

    const first = await playlistInfo(CR_HOST, request);
    const again = await playlistInfo(CR_HOST, request);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ mac_registered: false, status: 'success', trial_days: 7 });
    expect(typeof first.body.device_key).toBe('number');
    expect(again.body).toMatchObject({
      mac_registered: true,
      device_key: String(first.body.device_key),
    });
  });

  it('playlist_info speaks the bob profile when the brand is set to bob', async () => {
    const res = await playlistInfo(BOB_HOST, {
      mac_address: 'CC:00:00:00:10:02',
      app_type: 'lg',
      version: '1.0.0',
    });

    expect(res.body).toMatchObject({ trial_days: '7', real_time_notification: '0' });
    expect(res.outer).toHaveProperty('languages'); // bob sent languages next to `data`
  });

  it('playlist_info without a decodable envelope is refused', async () => {
    const res = await httpForm(port, '/api/playlist_info', CR_HOST, { data: '%%%' });
    expect(res.status).toBe(400);
  });

  it('signed Android: registers with a valid signature, answers AES with the new key', async () => {
    const res = await signedAndroid(CR_HOST, {
      mac_address: 'CC:00:00:00:10:03',
      app_type: 'android',
      version: '2.0',
    });

    expect(res.status).toBe(200);
    expect(decryptAndroid(res.body)).toMatchObject({ mac_registered: false, status: 'success' });
  });

  it('signed Android: refuses a missing or wrong signature like the old route', async () => {
    const body = { mac_address: 'CC:00:00:00:10:04', app_type: 'android' };

    expect((await signedAndroid(CR_HOST, body, '')).body).toEqual({
      status: 'error',
      msg: 'Sorry, Request Unauthorized',
    });
    expect((await signedAndroid(CR_HOST, body, 'bm9wZQ==')).body).toEqual({
      status: 'error',
      msg: 'Sorry, Request Security Issue',
    });
  });

  it('Roku device_login and register_device: token, device block, same device as the TV route', async () => {
    const tv = await playlistInfo(CR_HOST, { mac_address: 'CC:00:00:00:10:05', app_type: 'roku' });

    const login = await httpPost(port, '/api/device_login', CR_HOST, { mac: 'cc:00:00:00:10:05' });
    const register = await httpPost(port, '/api/register_device', CR_HOST, {
      mac: 'cc:00:00:00:10:05',
    });

    const body = login.body as { message: string; message2: { device: { key: string } } };
    expect(login.body).toMatchObject({ error: false, status: 200, message2: { playlists: [] } });
    expect(body.message2.device.key).toBe(String(tv.body.device_key));
    expect(register.body).toMatchObject({
      error: false,
      message: { device: { key: String(tv.body.device_key) } },
    });
  });

  it('Roku device_login without a MAC answers the old error body', async () => {
    const res = await httpPost(port, '/api/device_login', CR_HOST, {});
    expect(res.body).toEqual({ error: true, message: 'incorrect mac-address!', status: 404 });
  });

  it('iOS device_login keeps the first install uid and refuses another one', async () => {
    const mac = 'cc:00:00:00:10:06';

    const first = await httpPost(port, '/api/ios/v2/device_login', CR_HOST, {
      mac,
      uid: 'install-one',
      app_type: 'ios',
    });
    const same = await httpPost(port, '/api/android/v3/device_login', CR_HOST, {
      mac,
      uid: 'install-one',
      app_type: 'android',
    });
    const other = await httpPost(port, '/api/ios/v2/device_login', CR_HOST, {
      mac,
      uid: 'install-two',
      app_type: 'ios',
    });

    expect(first.body).toMatchObject({ error: false, status: 200 });
    expect((first.body as { message2: object }).message2).not.toHaveProperty('playlists');
    expect(same.body).toMatchObject({ error: false });
    expect(other.body).toEqual({ error: true, message: 'Device UID mismatch!', status: 403 });
  });

  it('iOS device_login without a uid answers the old error body', async () => {
    const res = await httpPost(port, '/api/ios/v2/device_login', CR_HOST, {
      mac: 'cc:00:00:00:10:07',
    });
    expect(res.body).toEqual({ error: true, message: 'incorrect mac-address!', status: 404 });
  });
});
