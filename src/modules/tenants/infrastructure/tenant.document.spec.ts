import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT_SETTINGS } from '../../../shared/kernel/tenant-settings.js';
import { toTenant } from './tenant.document.js';

const stored = {
  _id: 'id-1',
  slug: 'ibo',
  name: 'IBO Player',
  hosts: ['iboplayer.com'],
  status: 'active',
  dbName: 'ibo',
  createdAt: new Date('2026-10-20T00:00:00Z'),
  updatedAt: new Date('2026-10-20T00:00:00Z'),
};

describe('tenant document', () => {
  it('gives a brand stored before settings existed the defaults', () => {
    expect(toTenant(stored).settings).toEqual(DEFAULT_TENANT_SETTINGS);
  });

  it('fills settings added after the brand was stored', () => {
    const tenant = toTenant({ ...stored, settings: { features: { maintenance: true } } });

    expect(tenant.settings.features).toEqual({
      maintenance: true,
      rawPlaylistsForAndroid44: false,
    });
  });

  it('reads dates back from the JSON cache', () => {
    const tenant = toTenant(JSON.parse(JSON.stringify(stored)));

    expect(tenant.createdAt).toEqual(stored.createdAt);
  });

  it.each([
    [{ status: 'deleted' }],
    [{ hosts: 'iboplayer.com' }],
    [{ settings: { playlistProfile: 'roku' } }],
    [{ hosts: ['not a host'] }],
  ])('refuses a document edited into an invalid shape: %j', (change) => {
    expect(() => toTenant({ ...stored, ...change })).toThrow();
  });
});
