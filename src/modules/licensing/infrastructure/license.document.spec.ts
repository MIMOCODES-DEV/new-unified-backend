import { describe, expect, it } from 'vitest';
import type { License } from '../domain/license.js';
import { toLicense, toLicenseDocument } from './license.document.js';

function license(overrides: Partial<License>): License {
  return {
    id: 'license-1',
    deviceId: 'device-1',
    type: 'yearly',
    expiresAt: new Date('2027-10-25T23:59:59.999Z'),
    revoked: false,
    revokedAt: null,
    activatedBy: { source: 'reseller', actorId: 'reseller-7' },
    creditCost: 1,
    multiActivate: false,
    sourceId: 'code-42',
    createdAt: new Date('2026-10-25T10:00:00Z'),
    ...overrides,
  };
}

describe('license documents', () => {
  it('stores yearly and lifetime licenses and reads them back unchanged', () => {
    const yearly = license({});
    const lifetime = license({ id: 'license-2', type: 'lifetime', expiresAt: null, creditCost: 2 });

    expect(toLicense(toLicenseDocument(yearly))).toEqual(yearly);
    expect(toLicense(toLicenseDocument(lifetime))).toEqual(lifetime);
  });

  it.each([
    ['a lifetime license with an end date', { type: 'lifetime' as const }],
    ['a yearly license without an end date', { expiresAt: null }],
    ['an unknown activation source', { activatedBy: { source: 'gift', actorId: null } }],
    ['a credit cost of zero', { creditCost: 0 }],
  ])('refuses %s', (_case, overrides) => {
    expect(() => toLicenseDocument(license(overrides as Partial<License>))).toThrow();
  });
});
