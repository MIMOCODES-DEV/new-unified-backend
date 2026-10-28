import 'reflect-metadata';
import type { DynamicModule, Type } from '@nestjs/common';
import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { ApiModule } from '../../src/api.module.js';
import { ADMIN_CONTROLLERS } from '../../src/interfaces/http/accounts/accounts-http.module.js';
import { type Access, ACCESS_METADATA } from '../../src/shared/auth/access.decorators.js';

type ModuleRef = Type | DynamicModule | Promise<DynamicModule>;

/** Walks the module tree statically (no app boot) and collects every controller. */
function collectControllers(root: Type): Type[] {
  const seen = new Set<unknown>();
  const controllers = new Set<Type>();

  const visit = (ref: ModuleRef): void => {
    if (ref instanceof Promise || seen.has(ref)) return;
    seen.add(ref);
    const moduleClass = typeof ref === 'function' ? ref : ref.module;
    const read = (key: string): unknown[] => [
      ...((Reflect.getMetadata(key, moduleClass) as unknown[] | undefined) ?? []),
      ...(typeof ref === 'function'
        ? []
        : ((ref as unknown as Record<string, unknown[]>)[key] ?? [])),
    ];
    read(MODULE_METADATA.CONTROLLERS).forEach((c) => controllers.add(c as Type));
    read(MODULE_METADATA.IMPORTS).forEach((m) => visit(m as ModuleRef));
  };

  visit(root);
  return [...controllers];
}

describe('route access', () => {
  it('every HTTP route declares who may call it', () => {
    const missing: string[] = [];

    for (const controller of collectControllers(ApiModule)) {
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor')) {
        const handler = proto[name];
        if (
          typeof handler !== 'function' ||
          Reflect.getMetadata(PATH_METADATA, handler) === undefined
        )
          continue;
        const access =
          Reflect.getMetadata(ACCESS_METADATA, handler) ??
          Reflect.getMetadata(ACCESS_METADATA, controller);
        if (!access) missing.push(`${controller.name}.${name}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('every staff route is in ADMIN_CONTROLLERS, so its permission key is synced', () => {
    const outside: string[] = [];
    for (const controller of collectControllers(ApiModule)) {
      if ((ADMIN_CONTROLLERS as Type[]).includes(controller)) continue;
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (typeof handler !== 'function') continue;
        const access = (Reflect.getMetadata(ACCESS_METADATA, handler) ??
          Reflect.getMetadata(ACCESS_METADATA, controller)) as Access | undefined;
        if (access?.kind === 'staff') outside.push(`${controller.name}.${name}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('finds the controllers it checks', () => {
    expect(collectControllers(ApiModule).length).toBeGreaterThan(0);
  });
});
