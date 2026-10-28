import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT_SETTINGS } from '../../../shared/kernel/tenant-settings.js';
import {
  appFamily,
  crTvV4Info,
  isRunning,
  type LegacyDeviceInfo,
  mobileItems,
  rokuDevice,
  rokuItems,
  rokuTrialNumber,
  smartTvInfo,
  tvInfo,
} from './legacy-info.js';
import { platformOfAppType } from './legacy-reply.js';

const now = new Date('2026-10-28T10:00:00Z');
const legacy = DEFAULT_TENANT_SETTINGS.legacy;

const playlist = {
  id: 'pl-1',
  name: 'Home',
  type: 'xc' as const,
  url: 'http://line.example.com/',
  username: 'u',
  password: 'p',
  originUrl: 'http://line.example.com/get.php?username=u&password=p',
  epgUrl: null,
  protected: true,
  pin: '1234',
  code: null,
  stalker: null,
  provider: null,
  backupUrls: [],
  account: null,
  demo: false,
};
const demo = {
  ...playlist,
  id: null,
  name: 'Sample',
  protected: false,
  pin: undefined,
  demo: true,
};

function info(overrides: Partial<LegacyDeviceInfo> = {}): LegacyDeviceInfo {
  return {
    device: {
      id: 'dev-1',
      macAddress: '00:1a:2b:3c:4d:5e',
      deviceKey: '123456',
      uid: null,
      parentPin: '0000',
      stalkerEnabled: false,
      createdAt: new Date('2026-10-21T08:00:00Z'),
    },
    created: false,
    reviewBuild: false,
    license: {
      state: 'trial',
      active: true,
      endsAt: new Date('2026-11-04T23:59:59Z'),
      license: null,
    },
    playlists: { hasOwnPlaylist: true, playlists: [playlist] },
    trialDays: 7,
    ip: '203.0.113.9',
    now,
    ...overrides,
  };
}

describe('tvInfo: the TV playlist_info replies of each old backend', () => {
  it('ibo: a new TV gets its key as a number, an empty parent PIN and the portal fields', () => {
    const reply = tvInfo('ibo', info({ created: true }), 'tv', legacy);

    expect(reply).toMatchObject({
      mac_registered: false,
      device_key: 123456,
      parent_pin: '',
      is_trial: 0,
      expire_date: '2026-11-04',
      mac_address: '00:1a:2b:3c:4d:5e',
      stalker_enabled: false,
      trial_days: 7,
    });
    expect(Object.keys((reply.urls as object[])[0]!)).toContain('portal_name');
  });

  it('ibo: a known TV gets its key as text and its parent PIN', () => {
    const reply = tvInfo('ibo', info(), 'tv', legacy);

    expect(reply).toMatchObject({ mac_registered: true, device_key: '123456', parent_pin: '0000' });
  });

  it("ibo: Android apps get the update fields, no portal fields, and a new device's u_id", () => {
    const device = { ...info().device, uid: 'install-1' };
    const reply = tvInfo('ibo', info({ created: true, device }), 'android', legacy);

    expect(reply).toMatchObject({ android_version_code: '0', apk_url: '', u_id: 'install-1' });
    expect(Object.keys((reply.urls as object[])[0]!)).not.toContain('portal_name');
  });

  it('bob: notification fields, trial days as text, status, no parent PIN', () => {
    const reply = tvInfo('bob', info(), 'tv', { ...legacy, notificationInterval: '1000000' });

    expect(reply).toMatchObject({
      real_time_notification: '0',
      notification_interval: '1000000',
      trial_days: '7',
      status: 'success',
      is_expired: false,
      notification: { title: '', content: '' },
    });
    expect(reply).not.toHaveProperty('parent_pin');
    expect(reply).not.toHaveProperty('stalker_enabled');
  });

  it('cr: notifications and themes lists, the cr playlist fields', () => {
    const reply = tvInfo('cr', info(), 'tv', legacy);

    expect(reply).toMatchObject({ notifications: [], themes: [], status: 'success' });
    expect(Object.keys((reply.urls as object[])[0]!)).toEqual(
      expect.arrayContaining(['code', 'origin_type', 'origin_url', 'backup_urls']),
    );
  });

  it('a device with no playlist still gets one entry (the apps read urls[0])', () => {
    const reply = tvInfo(
      'ibo',
      info({ playlists: { hasOwnPlaylist: false, playlists: [] } }),
      'tv',
      legacy,
    );

    expect((reply.urls as object[]).length).toBe(1);
  });
});

describe('cr routes', () => {
  it('tv/v4: apiVersion v4, the parent PIN when set, recovery off', () => {
    expect(crTvV4Info(info())).toMatchObject({
      apiVersion: 'v4',
      parent_pin: '0000',
      recovery_code_enabled: false,
      mac_registered: true,
    });
  });

  it('smart TV device_info: the demo when the device has no playlist of its own', () => {
    const reply = smartTvInfo(info({ playlists: { hasOwnPlaylist: false, playlists: [demo] } }));

    expect(reply.playlists).toEqual([{ id: 'demo', name: 'Demo', url: '', type: 'general' }]);
  });
});

describe('Roku and old mobile replies', () => {
  it('a trial: not payed, free_trial 1, dates as ISO times', () => {
    expect(rokuDevice(info(), '00:1a:2b:3c:4d:5e')).toEqual({
      id: 'dev-1',
      mac: '00:1a:2b:3c:4d:5e',
      payed: false,
      free_trial: 1,
      free_trial_expired: '2026-11-04T00:00:00.000Z',
      key: '123456',
      createdAt: '2026-10-21T08:00:00.000Z',
    });
    expect(rokuTrialNumber(info())).toBe(1);
  });

  it('a running yearly license: payed, free_trial 0, validate_status number 3', () => {
    const paid = info({
      license: {
        state: 'yearly',
        active: true,
        endsAt: new Date('2027-10-28T00:00:00Z'),
        license: { type: 'yearly' },
      } as LegacyDeviceInfo['license'],
    });

    expect(rokuDevice(paid, 'm')).toMatchObject({ payed: true, free_trial: 0 });
    expect(rokuTrialNumber(paid)).toBe(3);
  });

  it('an ended trial is no longer running ("your free trial expired!")', () => {
    const ended = info({
      license: { state: 'expired', active: false, endsAt: now, license: null },
    });

    expect(isRunning(ended)).toBe(false);
  });

  it('items: own playlists only, with their PIN; Roku and mobile names', () => {
    const withDemo = info({ playlists: { hasOwnPlaylist: true, playlists: [playlist, demo] } });

    expect(rokuItems(withDemo)).toEqual([
      expect.objectContaining({
        id: 'pl-1',
        name: 'Home',
        pin: '1234',
        categories: 'xc',
        deviceId: 'dev-1',
      }),
    ]);
    expect(mobileItems(withDemo)).toEqual([
      expect.objectContaining({
        id: 'pl-1',
        name: 'Home',
        playlist_type: 'xc',
        origin_type: 'general',
      }),
    ]);
  });
});

describe('app types of the old routes', () => {
  it.each([
    ['android', 'android'],
    ['fire_tv', 'android'],
    ['iOS', 'ios'],
    ['tvOS', 'ios'],
    ['samsung', 'tv'],
    ['', 'tv'],
  ])('%s is the %s family', (appType, family) => {
    expect(appFamily(appType)).toBe(family);
  });

  it.each([
    ['iOS', 'ios'],
    ['fire_tv', 'android_tv'],
    ['Philips', 'zeasn'],
    ['roku', 'roku'],
    ['toaster', 'unknown'],
  ])('platform of %s is %s', (appType, platform) => {
    expect(platformOfAppType(appType)).toBe(platform);
  });
});
