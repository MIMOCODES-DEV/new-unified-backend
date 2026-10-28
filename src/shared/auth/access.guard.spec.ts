import {
  ForbiddenException,
  HttpException,
  NotImplementedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '../tenancy/tenant-context.js';
import { CentralStaff, Customer, Public, Staff, Store } from './access.decorators.js';
import { AccessGuard } from './access.guard.js';
import type { AuthContext, Caller } from './auth-context.js';
import type { SessionStore, SessionSubject } from './session-store.js';
import type { StaffAccessDecision } from './staff-access.js';

class TestController {
  @Public()
  open(): void {}

  @Store()
  store(): void {}

  @Staff('devices.activate')
  activate(): void {}

  @CentralStaff()
  me(): void {}

  @Customer()
  account(): void {}

  undecorated(): void {}
}

const BRAND = { id: 'tenant-a', slug: 'ibo' };

function contextFor(handler: keyof TestController, token = ''): ExecutionContext {
  return {
    getHandler: () => TestController.prototype[handler],
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: token ? `Bearer ${token}` : undefined } }),
    }),
  } as unknown as ExecutionContext;
}

function guardWith(sessions: Record<string, SessionSubject>, decision?: StaffAccessDecision) {
  const checks: { staffId: string; permission: string | null; brand: string | null }[] = [];
  const set: Caller[] = [];
  const guard = new AccessGuard(
    new Reflector(),
    { find: (token: string) => Promise.resolve(sessions[token] ?? null) } as SessionStore,
    {
      check: (staffId: string, permission: string | null, brand: string | null) => {
        checks.push({ staffId, permission, brand });
        return Promise.resolve(decision ?? { allowed: true });
      },
    },
    { set: (caller: Caller) => set.push(caller) } as unknown as AuthContext,
    {
      current: BRAND,
      isCurrent: (id: string | undefined) => id === BRAND.id,
    } as unknown as TenantContext,
  );
  return { guard, checks, set };
}

const status = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as HttpException).getStatus();
  }
};

describe('AccessGuard', () => {
  it('allows public routes', async () => {
    expect(await guardWith({}).guard.canActivate(contextFor('open'))).toBe(true);
  });

  it('refuses routes without an access decorator', async () => {
    await expect(guardWith({}).guard.canActivate(contextFor('undecorated'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses access kinds that are not implemented yet', async () => {
    await expect(guardWith({}).guard.canActivate(contextFor('store'))).rejects.toThrow(
      NotImplementedException,
    );
  });

  it('refuses staff routes without a staff session (401)', async () => {
    const { guard } = guardWith({ c: { kind: 'customer', id: 'c1', tenantId: BRAND.id } });
    expect(await status(guard.canActivate(contextFor('activate')))).toBe(401);
    expect(await status(guard.canActivate(contextFor('activate', 'c')))).toBe(401);
    expect(await status(guard.canActivate(contextFor('activate', 'unknown')))).toBe(401);
  });

  it('checks the permission and the brand served, and sets the caller', async () => {
    const { guard, checks, set } = guardWith({ s: { kind: 'staff', id: 'st1', tenantId: null } });
    expect(await guard.canActivate(contextFor('activate', 's'))).toBe(true);
    expect(await guard.canActivate(contextFor('me', 's'))).toBe(true);
    expect(checks).toEqual([
      { staffId: 'st1', permission: 'devices.activate', brand: 'ibo' },
      { staffId: 'st1', permission: null, brand: null },
    ]);
    expect(set[0]).toEqual({ kind: 'staff', staffId: 'st1', token: 's' });
  });

  it('answers with the staff check refusal', async () => {
    const { guard } = guardWith(
      { s: { kind: 'staff', id: 'st1', tenantId: null } },
      { allowed: false, status: 403, code: 'staff.brand_not_allowed', message: 'no' },
    );
    expect(await status(guard.canActivate(contextFor('activate', 's')))).toBe(403);
  });

  it('does not take a 2FA challenge as a staff session', async () => {
    const { guard } = guardWith({ ch: { kind: 'staff-2fa', id: 'st1', tenantId: null } });
    expect(await status(guard.canActivate(contextFor('me', 'ch')))).toBe(401);
  });

  it('lets a customer in on their own brand only', async () => {
    const { guard, set } = guardWith({
      mine: { kind: 'customer', id: 'c1', tenantId: BRAND.id },
      other: { kind: 'customer', id: 'c2', tenantId: 'tenant-b' },
      staff: { kind: 'staff', id: 'st1', tenantId: null },
    });
    expect(await guard.canActivate(contextFor('account', 'mine'))).toBe(true);
    expect(set[0]).toEqual({
      kind: 'customer',
      customerId: 'c1',
      tenantId: BRAND.id,
      token: 'mine',
    });
    expect(await status(guard.canActivate(contextFor('account', 'other')))).toBe(401);
    expect(await status(guard.canActivate(contextFor('account', 'staff')))).toBe(401);
  });
});
