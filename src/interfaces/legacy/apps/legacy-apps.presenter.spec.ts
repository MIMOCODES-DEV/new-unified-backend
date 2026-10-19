import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  appLoginBody,
  playlistInfoBody,
  registerDeviceBody,
  signedAndroidBody,
} from './legacy-apps.presenter.js';

interface HttpRecord {
  name: string;
  response: { decoded?: Record<string, unknown> };
}

function recorded(backend: string, name: string): Record<string, unknown> {
  const url = new URL(`../../../../test/fixtures/legacy/http/${backend}.json`, import.meta.url);
  const file = JSON.parse(readFileSync(url, 'utf8')) as { records: HttpRecord[] };
  const decoded = file.records.find((r) => r.name === name)?.response.decoded;
  if (!decoded) throw new Error(`no fixture ${backend} / ${name}`);
  return decoded;
}

const device = {
  macAddress: 'cc:00:00:00:00:01',
  deviceKey: '375122',
  isPaid: false,
  trialExpiresAt: new Date('2026-10-22T10:00:00Z'),
  activatedAt: null,
  id: 'fe15f950-8ae8-45e8-8f95-35d97a26d5d5',
  createdAt: new Date('2026-10-15T10:00:00Z'),
};

/** Same keys in the same order, and the same JSON type for every key. */
function expectSameShape(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  expect(Object.keys(actual)).toEqual(Object.keys(expected));
  for (const key of Object.keys(expected)) {
    const type = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
    expect(`${key}:${type(actual[key])}`).toBe(`${key}:${type(expected[key])}`);
  }
}

describe('legacy playlist_info bodies match the recorded old responses (keys, order, types)', () => {
  const cases = [
    ['ibo', 'iboplayer'],
    ['bob', 'bobplayer'],
    ['cr', 'cr-unified'],
  ] as const;

  for (const [profile, backend] of cases) {
    it(`${profile}: new device`, () => {
      const body = playlistInfoBody(profile, {
        device,
        created: true,
        trialDays: 7,
        ipAddress: '',
      });
      const expected = recorded(backend, 'legacy playlist_info (new device)');

      // bob's notification_interval is a string only because its brand stored it as one.
      expectSameShape(
        body,
        profile === 'bob' ? { ...expected, notification_interval: 300 } : expected,
      );
      expect(body.device_key).toBe(375122);
      expect(body.mac_registered).toBe(false);
      expect(body.expire_date).toBe('2026-10-22');
    });

    it(`${profile}: same device again`, () => {
      const body = playlistInfoBody(profile, {
        device,
        created: false,
        trialDays: 7,
        ipAddress: '',
      });
      const expected = recorded(backend, 'legacy playlist_info (same device again)');

      expectSameShape(
        body,
        profile === 'bob' ? { ...expected, notification_interval: 300 } : expected,
      );
      expect(body.device_key).toBe('375122');
      expect(body.mac_registered).toBe(true);
    });
  }

  it('cr leaves out ip_address when there is no proxy header, like the old route', () => {
    expect(
      playlistInfoBody('cr', { device, created: true, trialDays: 7, ipAddress: '' }),
    ).not.toHaveProperty('ip_address');
    expect(
      playlistInfoBody('cr', { device, created: true, trialDays: 7, ipAddress: '1.2.3.4' })
        .ip_address,
    ).toBe('1.2.3.4');
  });

  it('a paid device shows is_trial 2 with a lifetime expire_date', () => {
    const paid = { ...device, isPaid: true, activatedAt: new Date('2026-10-20T00:00:00Z') };

    expect(
      playlistInfoBody('ibo', { device: paid, created: false, trialDays: 7, ipAddress: '' }),
    ).toMatchObject({ is_trial: 2, expire_date: '2443-06-20' });
  });
});

describe('signed Android playlist_information bodies', () => {
  it('ibo: no mac_address for a new device, mac_address before device_key for an existing one', () => {
    const created = signedAndroidBody('ibo', {
      device,
      created: true,
      trialDays: 7,
      ipAddress: '',
    });
    const existing = signedAndroidBody('ibo', {
      device,
      created: false,
      trialDays: 7,
      ipAddress: '',
    });

    expect(created).not.toHaveProperty('mac_address');
    expect(Object.keys(existing).slice(-5)).toEqual([
      'mac_address',
      'device_key',
      'is_trial',
      'expire_date',
      'stalker_enabled',
    ]);
  });

  it('bob and cr: the bob-style body; cr has no ip_address', () => {
    expect(
      signedAndroidBody('bob', { device, created: true, trialDays: 7, ipAddress: '1.1.1.1' }),
    ).toMatchObject({ status: 'success', ip_address: '1.1.1.1', mac_address: 'cc:00:00:00:00:01' });
    expect(
      signedAndroidBody('cr', { device, created: true, trialDays: 7, ipAddress: '1.1.1.1' }),
    ).not.toHaveProperty('ip_address');
  });
});

describe('Roku and iOS/Android app bodies', () => {
  it('device_login: token twice, device block, playlists only for Roku', () => {
    const roku = appLoginBody({ token: 'TOK', device, withPlaylists: true });
    const ios = appLoginBody({ token: 'TOK', device, withPlaylists: false });

    expect(roku).toEqual({
      error: false,
      message: 'TOK',
      message2: {
        token: 'TOK',
        device: {
          id: device.id,
          mac: 'cc:00:00:00:00:01',
          payed: false,
          free_trial: 1,
          free_trial_expired: '2026-10-22T10:00:00.000Z',
          key: '375122',
          createdAt: '2026-10-15T10:00:00.000Z',
        },
        playlists: [],
      },
      status: 200,
    });
    expect(ios.message2).not.toHaveProperty('playlists');
  });

  it('a paid device is payed with free_trial 0', () => {
    const paid = { ...device, isPaid: true, activatedAt: new Date('2026-10-20T00:00:00Z') };

    expect(
      (
        appLoginBody({ token: 'T', device: paid, withPlaylists: true }).message2 as {
          device: object;
        }
      ).device,
    ).toMatchObject({ payed: true, free_trial: 0 });
  });

  it('register_device: message is the object itself', () => {
    const body = registerDeviceBody({ token: 'TOK', device });

    expect(Object.keys(body)).toEqual(['error', 'message', 'status']);
    expect(body.message).toMatchObject({ token: 'TOK', playlists: [] });
  });
});
