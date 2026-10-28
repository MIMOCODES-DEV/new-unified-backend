import type { Type } from '@nestjs/common';
import type { DeclaredPermission } from '../../../modules/staff/index.js';
import { type Access, ACCESS_METADATA } from '../../../shared/auth/access.decorators.js';

/** English labels the panel starts with; staff can change them there (and add Arabic). */
const DEFAULT_LABELS: Record<string, string> = {
  'devices.view': 'View devices',
  'devices.activate': 'Activate devices',
  'staff.manage': 'Manage staff',
  'roles.manage': 'Manage roles and permissions',
};

/**
 * PRM-1: every permission key the routes of these controllers check, read from their
 * `@Staff(key)` / `@CentralStaff(key)` decorators. The group is the part before the first dot.
 */
export function declaredPermissions(controllers: readonly Type[]): DeclaredPermission[] {
  const keys = new Set<string>();
  for (const controller of controllers) {
    const proto = controller.prototype as Record<string, unknown>;
    const handlers = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .map((name) => proto[name]);
    for (const target of [controller, ...handlers]) {
      if (typeof target !== 'function') continue;
      const access = Reflect.getMetadata(ACCESS_METADATA, target) as Access | undefined;
      if (access?.kind === 'staff' && access.permission) keys.add(access.permission);
    }
  }
  return [...keys].sort().map((key) => ({
    key,
    group: key.split('.')[0]!,
    label: DEFAULT_LABELS[key] ?? key,
  }));
}
