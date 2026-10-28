import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Permission } from '../../domain/staff.js';
import { InvalidStaffInputError, PermissionNotFoundError } from '../../domain/staff.errors.js';
import {
  type DeclaredPermission,
  PermissionRepository,
  RoleRepository,
} from '../ports/staff.repositories.js';

export interface PermissionSyncReport {
  /** Keys the code declares. */
  declared: number;
  /** Keys made inactive because the code no longer has them. */
  deactivated: string[];
  /** Roles a deactivated key was removed from. */
  rolesChanged: number;
}

/**
 * PRM-1: the keys in the code are the permissions. Run on every API startup and by
 * `pnpm cli permissions:sync`; safe on several servers at once (each step is idempotent).
 */
@Injectable()
export class SyncPermissionsUseCase {
  constructor(
    private readonly permissions: PermissionRepository,
    private readonly roles: RoleRepository,
    private readonly clock: Clock,
  ) {}

  async execute(declared: readonly DeclaredPermission[]): Promise<PermissionSyncReport> {
    const now = this.clock.now();
    await this.permissions.upsertDeclared(declared, now);
    const deactivated = await this.permissions.deactivateAllBut(
      declared.map((p) => p.key),
      now,
    );
    // All inactive keys, not only the ones turned off now: a server that crashed between the two
    // steps last time leaves none behind.
    const inactive = (await this.permissions.list()).filter((p) => !p.active).map((p) => p.key);
    const rolesChanged = await this.roles.removePermissions(inactive, now);
    return { declared: declared.length, deactivated, rolesChanged };
  }
}

@Injectable()
export class ListPermissionsUseCase {
  constructor(private readonly permissions: PermissionRepository) {}

  execute(): Promise<Permission[]> {
    return this.permissions.list();
  }
}

/** The panel edits how a key is shown; the key itself and `active` come from the code. */
@Injectable()
export class EditPermissionUseCase {
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(input: {
    key: string;
    label?: Permission['label'];
    description?: string | null;
    group?: string;
  }): Promise<Result<Permission, PermissionNotFoundError | InvalidStaffInputError>> {
    if (input.label !== undefined && !input.label.en.trim()) {
      return err(new InvalidStaffInputError('An English label is required'));
    }
    if (input.group !== undefined && !input.group.trim()) {
      return err(new InvalidStaffInputError('A group is required'));
    }
    const { key, ...change } = input;
    if (!(await this.permissions.edit(key, change))) {
      return err(new PermissionNotFoundError('Permission not found', { key }));
    }
    return ok((await this.permissions.findByKey(key))!);
  }
}
