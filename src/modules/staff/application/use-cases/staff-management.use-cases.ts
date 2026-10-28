import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { EmailAddress } from '../../../../shared/kernel/email-address.js';
import { isAcceptablePassword, PasswordHasher } from '../../../../shared/kernel/password-hasher.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { ALL_BRANDS, type StaffStatus, type StaffUser } from '../../domain/staff.js';
import {
  CannotChangeSelfError,
  InvalidStaffInputError,
  RoleNotFoundError,
  StaffEmailTakenError,
  StaffNotFoundError,
} from '../../domain/staff.errors.js';
import { StaffSessions } from '../ports/staff-security.js';
import { RoleRepository, StaffUserRepository } from '../ports/staff.repositories.js';

const BRAND_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** `*` alone, or brand slugs without repeats. Whether each brand exists is not checked here. */
function cleanTenantAccess(list: readonly string[]): string[] | null {
  const unique = [...new Set(list)];
  if (unique.includes(ALL_BRANDS)) return unique.length === 1 ? unique : null;
  return unique.every((s) => BRAND_SLUG.test(s)) ? unique : null;
}

export interface CreateStaffInput {
  email: string;
  name: string;
  password: string;
  roleId: string;
  tenantAccess: readonly string[];
}

/** STF-2: the super admin adds a staff member (also `pnpm cli staff:create` for the first one). */
@Injectable()
export class CreateStaffUseCase {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateStaffInput,
  ): Promise<Result<StaffUser, InvalidStaffInputError | RoleNotFoundError | StaffEmailTakenError>> {
    const email = EmailAddress.parse(input.email);
    if (!email.ok) return err(new InvalidStaffInputError('Invalid email address'));
    const name = input.name.trim();
    if (!name) return err(new InvalidStaffInputError('A name is required'));
    if (!isAcceptablePassword(input.password)) {
      return err(new InvalidStaffInputError('A password must be 8 to 128 characters'));
    }
    const tenantAccess = cleanTenantAccess(input.tenantAccess);
    if (!tenantAccess)
      return err(new InvalidStaffInputError('tenantAccess: brand slugs, or * alone'));
    if (!(await this.roles.findById(input.roleId))) {
      return err(new RoleNotFoundError('Role not found', { roleId: input.roleId }));
    }
    const now = this.clock.now();
    const created: StaffUser = {
      id: randomUUID(),
      email: email.value.value,
      passwordHash: await this.hasher.hash(input.password),
      name,
      roleId: input.roleId,
      tenantAccess,
      status: 'active',
      lastLoginAt: null,
      twoFactor: null,
      legacyRefs: [],
      createdAt: now,
      updatedAt: now,
    };
    if ((await this.staff.insert(created)) === 'email_taken') {
      return err(new StaffEmailTakenError('A staff member already has this email'));
    }
    return ok(created);
  }
}

export interface UpdateStaffInput {
  /** Who makes the change. */
  actorId: string;
  id: string;
  name?: string;
  email?: string;
  roleId?: string;
  tenantAccess?: readonly string[];
  status?: StaffStatus;
  password?: string;
  /** Turns 2FA off, for a member who lost the phone. */
  resetTwoFactor?: boolean;
}

/**
 * STF-2: role, brands, status and the rest. Disabling, a new password or a 2FA reset ends the
 * member's sessions on every server at once.
 */
@Injectable()
export class UpdateStaffUseCase {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: StaffSessions,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: UpdateStaffInput,
  ): Promise<
    Result<
      StaffUser,
      | StaffNotFoundError
      | InvalidStaffInputError
      | RoleNotFoundError
      | StaffEmailTakenError
      | CannotChangeSelfError
    >
  > {
    const found = await this.staff.findById(input.id);
    if (!found) return err(new StaffNotFoundError('Staff member not found'));
    if (
      input.actorId === found.id &&
      ((input.status && input.status !== found.status) ||
        (input.roleId && input.roleId !== found.roleId))
    ) {
      return err(new CannotChangeSelfError('You cannot disable yourself or change your own role'));
    }

    let next: StaffUser = { ...found };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) return err(new InvalidStaffInputError('A name is required'));
      next = { ...next, name };
    }
    if (input.email !== undefined) {
      const email = EmailAddress.parse(input.email);
      if (!email.ok) return err(new InvalidStaffInputError('Invalid email address'));
      next = { ...next, email: email.value.value };
    }
    if (input.tenantAccess !== undefined) {
      const tenantAccess = cleanTenantAccess(input.tenantAccess);
      if (!tenantAccess) {
        return err(new InvalidStaffInputError('tenantAccess: brand slugs, or * alone'));
      }
      next = { ...next, tenantAccess };
    }
    if (input.roleId !== undefined) {
      if (!(await this.roles.findById(input.roleId))) {
        return err(new RoleNotFoundError('Role not found', { roleId: input.roleId }));
      }
      next = { ...next, roleId: input.roleId };
    }
    if (input.status !== undefined) next = { ...next, status: input.status };
    if (input.password !== undefined) {
      if (!isAcceptablePassword(input.password)) {
        return err(new InvalidStaffInputError('A password must be 8 to 128 characters'));
      }
      next = { ...next, passwordHash: await this.hasher.hash(input.password) };
    }
    if (input.resetTwoFactor) next = { ...next, twoFactor: null };
    next = { ...next, updatedAt: this.clock.now() };

    const saved = await this.staff.update(next);
    if (saved === 'missing') return err(new StaffNotFoundError('Staff member not found'));
    if (saved === 'email_taken') {
      return err(new StaffEmailTakenError('A staff member already has this email'));
    }
    const cutOff =
      (next.status === 'disabled' && found.status !== 'disabled') ||
      input.password !== undefined ||
      (input.resetTwoFactor === true && found.twoFactor !== null);
    if (cutOff) await this.sessions.revokeAll(found.id);
    return ok(next);
  }
}

@Injectable()
export class ListStaffUseCase {
  constructor(private readonly staff: StaffUserRepository) {}

  execute(): Promise<StaffUser[]> {
    return this.staff.list();
  }
}

@Injectable()
export class GetStaffUseCase {
  constructor(private readonly staff: StaffUserRepository) {}

  async execute(id: string): Promise<Result<StaffUser, StaffNotFoundError>> {
    const found = await this.staff.findById(id);
    return found ? ok(found) : err(new StaffNotFoundError('Staff member not found'));
  }
}
