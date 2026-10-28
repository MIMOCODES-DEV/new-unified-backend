import type { EmailAddress } from '../../../../shared/kernel/email-address.js';
import type { Permission, Role, StaffUser } from '../../domain/staff.js';

/** `staffUsers`, central. */
export abstract class StaffUserRepository {
  abstract findById(id: string): Promise<StaffUser | null>;
  abstract findByEmail(email: EmailAddress): Promise<StaffUser | null>;
  /** Everyone, by email. */
  abstract list(): Promise<StaffUser[]>;
  abstract countWithRole(roleId: string): Promise<number>;
  abstract insert(staff: StaffUser): Promise<'inserted' | 'email_taken'>;
  abstract update(staff: StaffUser): Promise<'updated' | 'missing' | 'email_taken'>;
}

/** `roles`, central. */
export abstract class RoleRepository {
  abstract findById(id: string): Promise<Role | null>;
  abstract list(): Promise<Role[]>;
  /** `name_taken` when another role has this name (case does not matter). */
  abstract insert(role: Role): Promise<'inserted' | 'name_taken'>;
  abstract update(role: Role): Promise<'updated' | 'missing' | 'name_taken'>;
  abstract delete(id: string): Promise<boolean>;
  /** Removes these keys from every role (PRM-1: keys the code no longer has). */
  abstract removePermissions(keys: readonly string[], at: Date): Promise<number>;
}

/** What the code declares about a key; labels and descriptions are only defaults. */
export interface DeclaredPermission {
  readonly key: string;
  readonly group: string;
  readonly label: string;
}

/** `permissions`, central; written by the backend from the code (PRM-1). */
export abstract class PermissionRepository {
  abstract list(): Promise<Permission[]>;
  abstract findByKey(key: string): Promise<Permission | null>;
  /**
   * Inserts new keys and marks the given ones active with `syncedAt`, keeping a label or
   * description edited in the panel.
   */
  abstract upsertDeclared(declared: readonly DeclaredPermission[], at: Date): Promise<void>;
  /** Marks every key not in `keep` inactive; returns the keys that were active until now. */
  abstract deactivateAllBut(keep: readonly string[], at: Date): Promise<string[]>;
  /** Changes what the panel may edit: label, description, group. False when the key is unknown. */
  abstract edit(
    key: string,
    change: { label?: Permission['label']; description?: string | null; group?: string },
  ): Promise<boolean>;
}
