import { describe, expect, it } from 'vitest';
import {
  FakeTwoFactorCipher,
  InMemoryPermissionRepository,
  InMemoryRoleRepository,
  InMemoryStaffUserRepository,
  permission,
  PlainPasswordHasher,
  RecordingSessions,
  role,
  staffUser,
  superAdminRole,
} from '../../../../../test/support/account-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { totpCode } from '../../../../shared/kernel/totp.js';
import { AuthorizeStaffUseCase } from './authorize-staff.use-case.js';
import { EditPermissionUseCase, SyncPermissionsUseCase } from './permissions.use-cases.js';
import { CreateRoleUseCase, DeleteRoleUseCase, UpdateRoleUseCase } from './roles.use-cases.js';
import {
  SetUpTwoFactorUseCase,
  StaffLoginUseCase,
  StaffTwoFactorLoginUseCase,
  ToggleTwoFactorUseCase,
} from './staff-login.use-cases.js';
import { CreateStaffUseCase, UpdateStaffUseCase } from './staff-management.use-cases.js';

const now = new Date('2026-10-28T12:00:00Z');

function setup() {
  const staff = new InMemoryStaffUserRepository(
    staffUser(),
    staffUser({
      id: 'admin',
      email: 'boss@example.com',
      roleId: 'super_admin',
      tenantAccess: ['*'],
    }),
  );
  const roles = new InMemoryRoleRepository(superAdminRole(), role());
  const permissions = new InMemoryPermissionRepository(
    permission('devices.view'),
    permission('devices.activate'),
  );
  const clock = new FixedClock(now);
  const hasher = new PlainPasswordHasher();
  const sessions = new RecordingSessions();
  const cipher = new FakeTwoFactorCipher();
  const login = new StaffLoginUseCase(staff, hasher, clock);
  return {
    staff,
    roles,
    permissions,
    sessions,
    login,
    authorize: new AuthorizeStaffUseCase(staff, roles, permissions),
    twoFactorLogin: new StaffTwoFactorLoginUseCase(staff, cipher, login, clock),
    setUp2fa: new SetUpTwoFactorUseCase(staff, cipher, clock),
    toggle2fa: new ToggleTwoFactorUseCase(staff, cipher, sessions, clock),
    create: new CreateStaffUseCase(staff, roles, hasher, clock),
    update: new UpdateStaffUseCase(staff, roles, hasher, sessions, clock),
    createRole: new CreateRoleUseCase(roles, permissions, clock),
    updateRole: new UpdateRoleUseCase(roles, permissions, clock),
    deleteRole: new DeleteRoleUseCase(roles, staff),
    sync: new SyncPermissionsUseCase(permissions, roles, clock),
    edit: new EditPermissionUseCase(permissions),
  };
}

const codeOf = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }) =>
  r.ok ? 'ok' : r.error.code;

describe('STF-1 staff login', () => {
  it('logs in with the right password, any email case, and sets lastLoginAt', async () => {
    const t = setup();
    const result = await t.login.execute({ email: ' SAM@example.com', password: 'staff-pass' });
    expect(result.ok && result.value.twoFactorRequired).toBe(false);
    expect(t.staff.items.get('staff-1')!.lastLoginAt).toEqual(now);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const t = setup();
    const wrong = await t.login.execute({ email: 'sam@example.com', password: 'nope-nope' });
    const unknown = await t.login.execute({ email: 'who@example.com', password: 'staff-pass' });
    expect(!wrong.ok && wrong.error).toEqual(!unknown.ok && unknown.error);
    expect(codeOf(wrong)).toBe('staff.invalid_credentials');
  });

  it('refuses a disabled member', async () => {
    const t = setup();
    t.staff.items.set('staff-1', staffUser({ status: 'disabled' }));
    const result = await t.login.execute({ email: 'sam@example.com', password: 'staff-pass' });
    expect(codeOf(result)).toBe('staff.disabled');
  });
});

describe('two-factor login', () => {
  it('is required only once confirmed with a first code, then needs a valid code', async () => {
    const t = setup();
    const setUp = await t.setUp2fa.execute('staff-1');
    if (!setUp.ok) throw setUp.error;
    // Set up, not confirmed: the password is still enough.
    let login = await t.login.execute({ email: 'sam@example.com', password: 'staff-pass' });
    expect(login.ok && login.value.twoFactorRequired).toBe(false);

    const enable = await t.toggle2fa.execute({
      staffId: 'staff-1',
      on: true,
      code: totpCode(setUp.value.secret, now),
    });
    expect(enable.ok).toBe(true);
    login = await t.login.execute({ email: 'sam@example.com', password: 'staff-pass' });
    expect(login.ok && login.value.twoFactorRequired).toBe(true);

    const wrong = await t.twoFactorLogin.execute({ staffId: 'staff-1', code: '000000' });
    expect(codeOf(wrong)).toBe('staff.invalid_two_factor_code');
    const right = await t.twoFactorLogin.execute({
      staffId: 'staff-1',
      code: totpCode(setUp.value.secret, now),
    });
    expect(right.ok).toBe(true);
  });

  it('turning it off needs a code and logs out the other sessions', async () => {
    const t = setup();
    const setUp = await t.setUp2fa.execute('staff-1');
    if (!setUp.ok) throw setUp.error;
    const code = totpCode(setUp.value.secret, now);
    await t.toggle2fa.execute({ staffId: 'staff-1', on: true, code });
    expect(codeOf(await t.setUp2fa.execute('staff-1'))).toBe('staff.two_factor_state');
    expect(codeOf(await t.toggle2fa.execute({ staffId: 'staff-1', on: false, code: '1' }))).toBe(
      'staff.invalid_two_factor_code',
    );
    expect((await t.toggle2fa.execute({ staffId: 'staff-1', on: false, code })).ok).toBe(true);
    expect(t.staff.items.get('staff-1')!.twoFactor).toBeNull();
    expect(t.sessions.revoked).toEqual(['staff-1']);
  });
});

describe('STF-2 staff management', () => {
  it('creates a member with a lowercase email and a hashed password; one account per email', async () => {
    const t = setup();
    const created = await t.create.execute({
      email: 'New@Example.com',
      name: ' Nia ',
      password: 'long-enough',
      roleId: 'billing',
      tenantAccess: ['ibo', 'bob', 'ibo'],
    });
    if (!created.ok) throw created.error;
    expect(created.value).toMatchObject({
      email: 'new@example.com',
      name: 'Nia',
      passwordHash: 'hashed:long-enough',
      tenantAccess: ['ibo', 'bob'],
      status: 'active',
    });
    const again = await t.create.execute({
      email: 'new@example.com',
      name: 'Nia',
      password: 'long-enough',
      roleId: 'billing',
      tenantAccess: ['ibo'],
    });
    expect(codeOf(again)).toBe('staff.email_taken');
  });

  it('refuses an unknown role, a short password and * mixed with brands', async () => {
    const t = setup();
    const base = { email: 'x@example.com', name: 'X', password: 'long-enough', roleId: 'billing' };
    expect(codeOf(await t.create.execute({ ...base, roleId: 'nope', tenantAccess: ['ibo'] }))).toBe(
      'staff.role_not_found',
    );
    expect(codeOf(await t.create.execute({ ...base, password: 'short', tenantAccess: [] }))).toBe(
      'staff.invalid_input',
    );
    expect(codeOf(await t.create.execute({ ...base, tenantAccess: ['*', 'ibo'] }))).toBe(
      'staff.invalid_input',
    );
  });

  it('disabling a member ends their sessions; editing a name does not', async () => {
    const t = setup();
    await t.update.execute({ actorId: 'admin', id: 'staff-1', name: 'Samuel' });
    expect(t.sessions.revoked).toEqual([]);
    const disabled = await t.update.execute({
      actorId: 'admin',
      id: 'staff-1',
      status: 'disabled',
    });
    expect(disabled.ok && disabled.value.status).toBe('disabled');
    expect(t.sessions.revoked).toEqual(['staff-1']);
  });

  it('a new password ends the sessions too', async () => {
    const t = setup();
    await t.update.execute({ actorId: 'admin', id: 'staff-1', password: 'another-pass' });
    expect(t.staff.items.get('staff-1')!.passwordHash).toBe('hashed:another-pass');
    expect(t.sessions.revoked).toEqual(['staff-1']);
  });

  it('nobody disables themselves or changes their own role', async () => {
    const t = setup();
    expect(
      codeOf(await t.update.execute({ actorId: 'admin', id: 'admin', status: 'disabled' })),
    ).toBe('staff.cannot_change_self');
    expect(
      codeOf(await t.update.execute({ actorId: 'admin', id: 'admin', roleId: 'billing' })),
    ).toBe('staff.cannot_change_self');
    expect((await t.update.execute({ actorId: 'admin', id: 'admin', name: 'Boss' })).ok).toBe(true);
  });
});

describe('STF-3 access check', () => {
  const check = (
    t: ReturnType<typeof setup>,
    staffId: string,
    key: string | null,
    brand: string | null,
  ) => t.authorize.execute({ staffId, permission: key, brandSlug: brand }).then(codeOf);

  it('allows a key in the role on a brand in tenantAccess', async () => {
    expect(await check(setup(), 'staff-1', 'devices.activate', 'ibo')).toBe('ok');
  });

  it('refuses a missing key (403)', async () => {
    expect(await check(setup(), 'staff-1', 'staff.manage', 'ibo')).toBe('staff.missing_permission');
  });

  it('refuses a brand outside tenantAccess even with the key', async () => {
    expect(await check(setup(), 'staff-1', 'devices.activate', 'bob')).toBe(
      'staff.brand_not_allowed',
    );
  });

  it('allows every brand with *', async () => {
    const t = setup();
    t.staff.items.set('staff-1', staffUser({ tenantAccess: ['*'] }));
    expect(await check(t, 'staff-1', 'devices.activate', 'bob')).toBe('ok');
  });

  it('super_admin allows every key and brand', async () => {
    const t = setup();
    t.staff.items.set('staff-1', staffUser({ roleId: 'super_admin', tenantAccess: [] }));
    expect(await check(t, 'staff-1', 'anything.at_all', 'bob')).toBe('ok');
  });

  it('refuses a key the role lists once it is inactive', async () => {
    const t = setup();
    t.permissions.items.set('devices.activate', permission('devices.activate', { active: false }));
    expect(await check(t, 'staff-1', 'devices.activate', 'ibo')).toBe('staff.missing_permission');
  });

  it('a disabled or removed member is unauthenticated', async () => {
    const t = setup();
    t.staff.items.set('staff-1', staffUser({ status: 'disabled' }));
    expect(await check(t, 'staff-1', null, null)).toBe('staff.unauthenticated');
    expect(await check(t, 'gone', null, null)).toBe('staff.unauthenticated');
  });

  it('central routes skip the brand check', async () => {
    const t = setup();
    t.staff.items.set('staff-1', staffUser({ tenantAccess: [] }));
    expect(await check(t, 'staff-1', null, null)).toBe('ok');
  });
});

describe('PRM-1 permission sync', () => {
  it('inserts new keys, keeps edited labels, deactivates missing keys and pulls them from roles', async () => {
    const t = setup();
    await t.edit.execute({ key: 'devices.view', label: { en: 'See TVs', ar: 'عرض' } });
    const report = await t.sync.execute([
      { key: 'devices.view', group: 'devices', label: 'View devices' },
      { key: 'staff.manage', group: 'staff', label: 'Manage staff' },
    ]);
    expect(report).toEqual({ declared: 2, deactivated: ['devices.activate'], rolesChanged: 1 });
    expect(t.permissions.items.get('devices.view')!.label).toEqual({ en: 'See TVs', ar: 'عرض' });
    expect(t.permissions.items.get('staff.manage')!.active).toBe(true);
    expect(t.permissions.items.get('devices.activate')!.active).toBe(false);
    expect(t.roles.items.get('billing')!.permissions).toEqual(['devices.view']);
  });

  it('a key back in the code is active again', async () => {
    const t = setup();
    await t.sync.execute([]);
    await t.sync.execute([{ key: 'devices.view', group: 'devices', label: 'View' }]);
    expect(t.permissions.items.get('devices.view')!.active).toBe(true);
  });
});

describe('PRM-2 roles', () => {
  it('creates a role from active keys; refuses unknown or inactive ones', async () => {
    const t = setup();
    const created = await t.createRole.execute({
      name: 'Viewers',
      permissions: ['devices.view', 'devices.view'],
      createdBy: 'admin',
    });
    expect(created.ok && created.value.permissions).toEqual(['devices.view']);
    t.permissions.items.set('devices.activate', permission('devices.activate', { active: false }));
    const refused = await t.createRole.execute({
      name: 'Other',
      permissions: ['devices.activate', 'made.up'],
      createdBy: 'admin',
    });
    expect(!refused.ok && refused.error.details).toEqual({
      unknown: ['devices.activate', 'made.up'],
    });
  });

  it('role names are unique whatever the case', async () => {
    const t = setup();
    const result = await t.createRole.execute({ name: 'billing', permissions: [], createdBy: 'a' });
    expect(codeOf(result)).toBe('staff.role_name_taken');
  });

  it('super_admin cannot be edited or deleted', async () => {
    const t = setup();
    expect(codeOf(await t.updateRole.execute({ id: 'super_admin', name: 'Root' }))).toBe(
      'staff.system_role',
    );
    expect(codeOf(await t.deleteRole.execute('super_admin'))).toBe('staff.system_role');
  });

  it('a role still given to someone is not deleted', async () => {
    const t = setup();
    expect(codeOf(await t.deleteRole.execute('billing'))).toBe('staff.role_in_use');
    t.staff.items.delete('staff-1');
    expect(codeOf(await t.deleteRole.execute('billing'))).toBe('ok');
  });
});
