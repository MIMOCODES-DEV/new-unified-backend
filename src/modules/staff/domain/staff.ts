/**
 * Staff (the admin side), central for every brand. One person has one account; `tenantAccess` limits
 * the brands, the role limits the actions (Phase 5 schema).
 */

export const STAFF_STATUSES = ['active', 'disabled'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

/** Every brand. */
export const ALL_BRANDS = '*';

/** Where an account came from in the old backends (one person may have had several Admin rows). */
export interface StaffLegacyRef {
  readonly source: string;
  readonly model: string;
  readonly id: string;
  readonly numericId: number | null;
}

/** Two-factor login with an authenticator app (TOTP). */
export interface StaffTwoFactor {
  /** The shared secret, encrypted; never shown again after setup. */
  readonly secretEnc: string;
  /** Null while set up but not yet confirmed with a first code: not required at login yet. */
  readonly enabledAt: Date | null;
}

export interface StaffUser {
  readonly id: string;
  /** Lowercase; one account per person. */
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly roleId: string;
  /** Brand slugs this person manages, or `*` for every brand. */
  readonly tenantAccess: readonly string[];
  readonly status: StaffStatus;
  readonly lastLoginAt: Date | null;
  readonly twoFactor: StaffTwoFactor | null;
  readonly legacyRefs: readonly StaffLegacyRef[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The fixed id of the system role: every permission, cannot be changed or deleted. */
export const SUPER_ADMIN_ROLE_ID = 'super_admin';

export interface Role {
  readonly id: string;
  /** Unique, case does not matter. */
  readonly name: string;
  /** Permission keys; each must exist and be active in `permissions`. Empty for super_admin. */
  readonly permissions: readonly string[];
  /** True only for super_admin. */
  readonly system: boolean;
  /** The staff user who made it; null for the roles the migrations made. */
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A permission key the code checks, e.g. `devices.activate`. Keys come from the code. */
export interface Permission {
  readonly key: string;
  readonly group: string;
  /** Editable in the panel; kept when the backend syncs the keys. */
  readonly label: { readonly en: string; readonly ar: string | null };
  readonly description: string | null;
  /** False once the code no longer has the key. */
  readonly active: boolean;
  /** The last startup that found the key in the code. */
  readonly syncedAt: Date;
}

/** May this staff user act on this brand? `*` means every brand. */
export function canManageBrand(staff: StaffUser, slug: string): boolean {
  return staff.tenantAccess.includes(ALL_BRANDS) || staff.tenantAccess.includes(slug);
}
