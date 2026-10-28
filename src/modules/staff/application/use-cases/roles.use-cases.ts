import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Role } from '../../domain/staff.js';
import {
  InvalidStaffInputError,
  RoleInUseError,
  RoleNameTakenError,
  RoleNotFoundError,
  SystemRoleError,
  UnknownPermissionError,
} from '../../domain/staff.errors.js';
import {
  PermissionRepository,
  RoleRepository,
  StaffUserRepository,
} from '../ports/staff.repositories.js';

/** PRM-2: a role may list only keys that exist and are active; no repeats. */
async function checkPermissions(
  permissions: PermissionRepository,
  keys: readonly string[],
): Promise<Result<string[], UnknownPermissionError>> {
  const unique = [...new Set(keys)];
  const active = new Set((await permissions.list()).filter((p) => p.active).map((p) => p.key));
  const unknown = unique.filter((k) => !active.has(k));
  if (unknown.length > 0) {
    return err(new UnknownPermissionError('Unknown or inactive permission keys', { unknown }));
  }
  return ok(unique.sort());
}

@Injectable()
export class ListRolesUseCase {
  constructor(private readonly roles: RoleRepository) {}

  execute(): Promise<Role[]> {
    return this.roles.list();
  }
}

@Injectable()
export class CreateRoleUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly permissions: PermissionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    name: string;
    permissions: readonly string[];
    createdBy: string;
  }): Promise<Result<Role, InvalidStaffInputError | UnknownPermissionError | RoleNameTakenError>> {
    const name = input.name.trim();
    if (!name) return err(new InvalidStaffInputError('A role name is required'));
    const keys = await checkPermissions(this.permissions, input.permissions);
    if (!keys.ok) return keys;
    const now = this.clock.now();
    const role: Role = {
      id: randomUUID(),
      name,
      permissions: keys.value,
      system: false,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    if ((await this.roles.insert(role)) === 'name_taken') {
      return err(new RoleNameTakenError('Another role has this name'));
    }
    return ok(role);
  }
}

@Injectable()
export class UpdateRoleUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly permissions: PermissionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    id: string;
    name?: string;
    permissions?: readonly string[];
  }): Promise<
    Result<
      Role,
      | RoleNotFoundError
      | SystemRoleError
      | InvalidStaffInputError
      | UnknownPermissionError
      | RoleNameTakenError
    >
  > {
    const found = await this.roles.findById(input.id);
    if (!found) return err(new RoleNotFoundError('Role not found'));
    if (found.system) return err(new SystemRoleError('The super admin role cannot be changed'));
    let next: Role = { ...found };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) return err(new InvalidStaffInputError('A role name is required'));
      next = { ...next, name };
    }
    if (input.permissions !== undefined) {
      const keys = await checkPermissions(this.permissions, input.permissions);
      if (!keys.ok) return keys;
      next = { ...next, permissions: keys.value };
    }
    next = { ...next, updatedAt: this.clock.now() };
    const saved = await this.roles.update(next);
    if (saved === 'missing') return err(new RoleNotFoundError('Role not found'));
    if (saved === 'name_taken') return err(new RoleNameTakenError('Another role has this name'));
    return ok(next);
  }
}

/** A role still given to someone is not deleted: move those members to another role first. */
@Injectable()
export class DeleteRoleUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly staff: StaffUserRepository,
  ) {}

  async execute(
    id: string,
  ): Promise<Result<{ deleted: true }, RoleNotFoundError | SystemRoleError | RoleInUseError>> {
    const found = await this.roles.findById(id);
    if (!found) return err(new RoleNotFoundError('Role not found'));
    if (found.system) return err(new SystemRoleError('The super admin role cannot be deleted'));
    const members = await this.staff.countWithRole(id);
    if (members > 0) {
      return err(new RoleInUseError('Staff members still have this role', { members }));
    }
    if (!(await this.roles.delete(id))) return err(new RoleNotFoundError('Role not found'));
    return ok({ deleted: true });
  }
}
