import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CentralStaff, Public, Staff } from '../../../shared/auth/access.decorators.js';
import { ADMIN_CONTROLLERS } from './accounts-http.module.js';
import { declaredPermissions } from './permission-keys.js';

class A {
  @Staff('devices.view')
  one(): void {}

  @Staff('devices.view')
  two(): void {}

  @CentralStaff()
  me(): void {}

  @Public()
  open(): void {}
}

@CentralStaff('reports.view')
class B {}

describe('declaredPermissions (PRM-1)', () => {
  it('collects each key once, from methods and classes, with its group', () => {
    expect(declaredPermissions([A, B])).toEqual([
      { key: 'devices.view', group: 'devices', label: 'View devices' },
      { key: 'reports.view', group: 'reports', label: 'reports.view' },
    ]);
  });

  it('the admin routes declare the keys the seeded roles use', () => {
    const keys = declaredPermissions(ADMIN_CONTROLLERS).map((p) => p.key);
    expect(keys).toEqual([
      'contact.view',
      'devices.activate',
      'devices.view',
      'roles.manage',
      'staff.manage',
    ]);
  });
});
