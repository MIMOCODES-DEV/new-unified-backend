import { describe, expect, it } from 'vitest';
import { role, staffUser } from '../../../../test/support/account-fakes.js';
import {
  toPermission,
  toRole,
  toRoleDocument,
  toStaffUser,
  toStaffUserDocument,
} from './staff.documents.js';

describe('staff documents (ACC-1)', () => {
  it('a staff user round-trips through its stored shape', () => {
    const staff = staffUser({
      twoFactor: { secretEnc: 'sealed', enabledAt: new Date('2026-10-28T00:00:00Z') },
      legacyRefs: [{ source: 'cr', model: 'Admin', id: 'abc', numericId: 7 }],
    });
    const doc = toStaffUserDocument(staff);
    expect(doc._id).toBe(staff.id);
    expect(toStaffUser(doc)).toEqual(staff);
  });

  it('refuses a stored email that is not lowercase', () => {
    expect(() =>
      toStaffUser({ ...toStaffUserDocument(staffUser()), email: 'Sam@example.com' }),
    ).toThrow();
  });

  it('a role round-trips; a permission reads with its key', () => {
    const r = role();
    expect(toRole(toRoleDocument(r))).toEqual(r);
    const syncedAt = new Date('2026-10-28T00:00:00Z');
    expect(
      toPermission({
        _id: 'devices.view',
        group: 'devices',
        label: { en: 'View devices', ar: null },
        description: null,
        active: true,
        syncedAt,
      }),
    ).toEqual({
      key: 'devices.view',
      group: 'devices',
      label: { en: 'View devices', ar: null },
      description: null,
      active: true,
      syncedAt,
    });
  });
});
