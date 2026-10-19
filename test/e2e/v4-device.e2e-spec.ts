import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiModule } from '../../src/api.module.js';
import {
  appDecode,
  appEncode,
  cli,
  type E2eEnv,
  httpPost,
  startE2eEnv,
} from './support/e2e-env.js';

const HOST = 'shop.test';
const MAC = 'CC:00:00:00:00:02';

/**
 * A fake V4 TV app against the real server: captcha → login → device_info, encoded exactly like
 * the installed apps encode (test/fixtures/legacy/codecs). The captcha answer is read from MongoDB,
 * as the legacy capture did.
 */
describe('V4 device API (e2e)', () => {
  let e2e: E2eEnv;
  let app: NestFastifyApplication;
  let port: number;
  let client: MongoClient;

  /** POSTs an app-encoded body and decodes the `{data}` answer. */
  async function v4(
    path: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    const { data, key } = appEncode(body);
    const res = await httpPost(port, `/api/lg/v4/${path}`, HOST, { data }, headers);
    const raw = (res.body as { data?: string }).data;
    return { status: res.status, body: raw ? appDecode(raw, key) : res.body };
  }

  async function captcha(mac = MAC): Promise<{ token: string; answer: string }> {
    const res = await httpPost(port, '/api/lg/v4/recaptcha', HOST, {
      mac_address: mac,
      app_type: 'lg',
    });
    const { token } = res.body as { token: string };
    const stored = await client
      .db('shop')
      .collection<{ _id: string; text: string }>('captchas')
      .findOne({ _id: token });
    return { token, answer: stored?.text ?? '' };
  }

  beforeAll(async () => {
    e2e = await startE2eEnv();
    expect((await cli(e2e.env, 'migrate:central')).exitCode).toBe(0);
    expect((await cli(e2e.env, 'tenant:create', 'shop', 'Shop Player', HOST)).exitCode).toBe(0);
    expect((await cli(e2e.env, 'migrate:tenants')).exitCode).toBe(0);
    client = await MongoClient.connect(e2e.infra.mongoUri);

    Object.assign(process.env, e2e.env, { LOG_LEVEL: 'warn' });
    app = await NestFactory.create<NestFastifyApplication>(ApiModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app?.close();
    await client?.close();
    await e2e?.infra.stop();
  });

  it('runs the whole first start: recaptcha → device_login → device_info', async () => {
    const res = await httpPost(port, '/api/lg/v4/recaptcha', HOST, {
      mac_address: MAC,
      app_type: 'lg',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'success',
      captcha: expect.stringContaining('<svg style="color: white;"'),
      token: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const { token, answer } = await (async () => {
      const t = (res.body as { token: string }).token;
      const stored = await client
        .db('shop')
        .collection<{ _id: string; text: string }>('captchas')
        .findOne({ _id: t });
      return { token: t, answer: stored?.text ?? '' };
    })();
    const login = await v4('device_login', {
      mac_address: MAC,
      app_type: 'lg',
      u_id: 'ACDE13',
      version: '1.0.7',
      recaptcha_code: answer.toLowerCase(),
      recaptcha_token: token,
    });
    expect(login).toEqual({ status: 200, body: { status: 'success', token: expect.any(String) } });
    const loginToken = (login.body as { token: string }).token;

    const info = await v4(
      'device_info',
      { mac_address: MAC, app_type: 'lg', u_id: 'ACDE13', version: '1.0.7' },
      { authorization: `Bearer ${loginToken}` },
    );
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({
      status: 'success',
      mac_registered: true,
      is_trial: 0,
      trial_days: 7,
      is_expired: false,
      device_key: expect.stringMatching(/^\d{6}$/),
    });
    const expected = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect((info.body as { expire_date: string }).expire_date).toBe(expected);

    expect(
      await client
        .db('shop')
        .collection('pendingDevices')
        .countDocuments({ macAddress: 'cc:00:00:00:00:02' }),
    ).toBe(1);
    expect(
      await client
        .db('shop')
        .collection('captchas')
        .countDocuments({ _id: token as never }),
    ).toBe(0);
  });

  it('answers already_verified to recaptcha, and logs in again without a captcha', async () => {
    const res = await httpPost(port, '/api/lg/v4/recaptcha', HOST, {
      mac_address: MAC,
      app_type: 'lg',
    });
    const again = await v4('device_login', { mac_address: MAC, app_type: 'lg', u_id: 'acde13' });

    expect(res.body).toEqual({ status: 'already_verified' });
    expect(again.body).toMatchObject({ status: 'success' });
  });

  it('challenges another install (other u_id) with the u_id recovery captcha', async () => {
    const other = await v4('device_login', { mac_address: MAC, app_type: 'lg', u_id: 'ZZ99ZZ' });

    expect(other.body).toMatchObject({
      status: 'uid_mismatch_captcha',
      error_code: 401,
      message: 'Device ID mismatch. Enter the code shown in the image to verify ownership.',
      captcha_token: expect.any(String),
    });
  });

  it('refuses a new device without a captcha, and a wrong captcha', async () => {
    const mac = 'CC:00:00:00:00:09';
    const none = await v4('device_login', { mac_address: mac, app_type: 'lg', u_id: 'QQQQQQ' });
    const { token } = await captcha(mac);
    const wrong = await v4('device_login', {
      mac_address: mac,
      app_type: 'lg',
      u_id: 'QQQQQQ',
      recaptcha_code: 'XXXX',
      recaptcha_token: token,
    });

    expect(none.body).toEqual({ status: 'error', message: 'Captcha code and token are required' });
    expect(wrong.body).toEqual({
      status: 'error',
      error_code: 401,
      message: 'Invalid or expired captcha. Please request a new captcha and try again.',
    });
    expect(
      await client
        .db('shop')
        .collection('pendingDevices')
        .countDocuments({ macAddress: 'cc:00:00:00:00:09' }),
    ).toBe(0);
  });

  it('returns the old errors: no token 401, bad token 403, invalid u_id, wrong app_type, unknown type 404', async () => {
    const noToken = await v4('device_info', { mac_address: MAC, app_type: 'lg', u_id: 'ACDE13' });
    const badToken = await v4(
      'device_info',
      { mac_address: MAC, app_type: 'lg', u_id: 'ACDE13' },
      { authorization: 'Bearer AAAA' },
    );
    const badUid = await v4('device_login', { mac_address: MAC, app_type: 'lg', u_id: 'abc' });
    const badType = await v4('device_login', {
      mac_address: MAC,
      app_type: 'samsung',
      u_id: 'ACDE13',
    });
    const unknownType = await httpPost(port, '/api/toaster/v4/recaptcha', HOST, {
      mac_address: MAC,
    });

    expect(noToken).toEqual({
      status: 401,
      body: { status: 'error', message: 'Device login token is required' },
    });
    expect(badToken).toEqual({
      status: 403,
      body: { status: 'error', message: 'Invalid device login token' },
    });
    expect(badUid.body).toEqual({
      status: 'error',
      message: 'Invalid u_id. Must be exactly 6 alphanumeric characters.',
    });
    expect(badType.body).toEqual({ status: 'error', message: 'Invalid app_type' });
    expect(unknownType.status).toBe(404);
  });
});
