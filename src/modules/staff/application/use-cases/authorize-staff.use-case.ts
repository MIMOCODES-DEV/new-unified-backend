import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { canManageBrand, type Role, type StaffUser } from '../../domain/staff.js';
import {
  BrandNotAllowedError,
  MissingPermissionError,
  StaffUnauthenticatedError,
} from '../../domain/staff.errors.js';
import {
  PermissionRepository,
  RoleRepository,
  StaffUserRepository,
} from '../ports/staff.repositories.js';

export interface AuthorizeStaffInput {
  /** From the session. */
  staffId: string;
  /** The route's permission key; null = any active staff member. */
  permission: string | null;
  /** The brand the route acts on; null for central routes (staff, roles). */
  brandSlug: string | null;
}

export interface StaffPrincipal {
  readonly staff: StaffUser;
  readonly role: Role;
}

/**
 * STF-3: read on every admin request, so a disabled member, a changed role or a removed key takes
 * effect on the next request. super_admin passes every key and every brand.
 */
@Injectable()
export class AuthorizeStaffUseCase {
  constructor(
    private readonly staff: StaffUserRepository,
    private readonly roles: RoleRepository,
    private readonly permissions: PermissionRepository,
  ) {}

  async execute(
    input: AuthorizeStaffInput,
  ): Promise<
    Result<
      StaffPrincipal,
      StaffUnauthenticatedError | MissingPermissionError | BrandNotAllowedError
    >
  > {
    const staff = await this.staff.findById(input.staffId);
    if (!staff || staff.status !== 'active') {
      return err(new StaffUnauthenticatedError('Log in again'));
    }
    const role = await this.roles.findById(staff.roleId);
    if (!role) return err(new MissingPermissionError('Your role no longer exists'));
    if (role.system) return ok({ staff, role });

    if (input.permission !== null) {
      const permission = role.permissions.includes(input.permission)
        ? await this.permissions.findByKey(input.permission)
        : null;
      if (!permission?.active) {
        return err(
          new MissingPermissionError('Your role does not allow this', {
            permission: input.permission,
          }),
        );
      }
    }
    if (input.brandSlug !== null && !canManageBrand(staff, input.brandSlug)) {
      return err(
        new BrandNotAllowedError('You do not manage this brand', { brand: input.brandSlug }),
      );
    }
    return ok({ staff, role });
  }
}
