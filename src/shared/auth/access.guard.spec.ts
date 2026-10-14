import { ForbiddenException, NotImplementedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Public, Store } from './access.decorators.js';
import { AccessGuard } from './access.guard.js';

class TestController {
  @Public()
  open(): void {}

  @Store()
  store(): void {}

  undecorated(): void {}
}

function contextFor(handler: keyof TestController): ExecutionContext {
  return {
    getHandler: () => TestController.prototype[handler],
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

describe('AccessGuard', () => {
  const guard = new AccessGuard(new Reflector());

  it('allows public routes', () => {
    expect(guard.canActivate(contextFor('open'))).toBe(true);
  });

  it('refuses routes without an access decorator', () => {
    expect(() => guard.canActivate(contextFor('undecorated'))).toThrow(ForbiddenException);
  });

  it('refuses access kinds that are not implemented yet', () => {
    expect(() => guard.canActivate(contextFor('store'))).toThrow(NotImplementedException);
  });
});
