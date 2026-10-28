import { describe, expect, it } from 'vitest';
import type { PlaylistReply } from '../../../modules/playlists/index.js';
import { DEFAULT_TENANT_SETTINGS } from '../../../shared/kernel/tenant-settings.js';
import { legacyUrls, notificationFields, raspEnforceField } from './legacy-reply.js';

const item = (type: 'general' | 'xc' | 'stalker' | 'code') =>
  ({
    id: `pl-${type}`,
    name: type,
    type,
    url: type === 'stalker' || type === 'code' ? null : 'http://line.example.com/',
    username: type === 'xc' ? 'u' : null,
    password: type === 'xc' ? 'p' : null,
    originUrl: 'http://line.example.com/get.php?username=u&password=p',
    epgUrl: null,
    protected: false,
    stalker: null,
    code: type === 'code' ? '123' : null,
    provider: null,
    account: null,
    backupUrls: [],
    demo: false,
  }) as PlaylistReply['playlists'][number];

describe('legacyUrls origin_type (#10.3)', () => {
  it('sends the form the playlist was typed in, next to origin_url', () => {
    const urls = legacyUrls({
      hasOwnPlaylist: true,
      playlists: [item('xc'), item('general'), item('stalker'), item('code')],
    });

    expect(urls.map((u) => [u.playlist_type, u.origin_type])).toEqual([
      ['xc', 'general'],
      ['general', 'general'],
      ['stalker', 'stalker'],
      ['code', 'code'],
    ]);
  });

  it('the placeholder has it too', () => {
    expect(legacyUrls({ hasOwnPlaylist: false, playlists: [] })[0]?.origin_type).toBe('general');
  });
});

describe('per-brand device_info fields (#10.2, #10.4, #10.5)', () => {
  const legacy = DEFAULT_TENANT_SETTINGS.legacy;

  it('by default (ibo, bob): notification fields with the interval as text, no rasp_enforce', () => {
    expect(notificationFields(legacy)).toEqual({
      notification: { title: '', content: '' },
      real_time_notification: '0',
      notification_interval: '300',
    });
    expect(raspEnforceField(legacy)).toEqual({});
  });

  it('bob: its own interval, as text', () => {
    expect(notificationFields({ ...legacy, notificationInterval: '1000000' })).toMatchObject({
      notification_interval: '1000000',
    });
  });

  it('cr: rasp_enforce false and no notification fields', () => {
    const cr = { ...legacy, raspEnforce: false, notificationFields: false };

    expect(raspEnforceField(cr)).toEqual({ rasp_enforce: false });
    expect(notificationFields(cr)).toEqual({});
  });
});
