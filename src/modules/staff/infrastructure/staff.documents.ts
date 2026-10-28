import { z } from 'zod';
import { type Permission, type Role, STAFF_STATUSES, type StaffUser } from '../domain/staff.js';

export const STAFF_USERS_COLLECTION = 'staffUsers';
export const ROLES_COLLECTION = 'roles';
export const PERMISSIONS_COLLECTION = 'permissions';

const lowercaseEmail = z.email().refine((e) => e === e.toLowerCase(), 'stored lowercase');

/** Stored shape of a `staffUsers` row, checked on every read. */
export const staffUserDocumentSchema = z.object({
  _id: z.string().min(1),
  email: lowercaseEmail,
  passwordHash: z.string().min(1),
  name: z.string().trim().min(1),
  roleId: z.string().min(1),
  tenantAccess: z.array(z.string().min(1)),
  status: z.enum(STAFF_STATUSES),
  lastLoginAt: z.date().nullable(),
  twoFactor: z.object({ secretEnc: z.string().min(1), enabledAt: z.date().nullable() }).nullable(),
  legacyRefs: z.array(
    z.object({
      source: z.string(),
      model: z.string(),
      id: z.string(),
      numericId: z.number().int().nullable(),
    }),
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Stored shape of a `roles` row. */
export const roleDocumentSchema = z.object({
  _id: z.string().min(1),
  name: z.string().trim().min(1),
  permissions: z.array(z.string().min(1)),
  system: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Stored shape of a `permissions` row; `_id` is the key. */
export const permissionDocumentSchema = z.object({
  _id: z.string().min(1),
  group: z.string().min(1),
  label: z.object({ en: z.string().min(1), ar: z.string().nullable() }),
  description: z.string().nullable(),
  active: z.boolean(),
  syncedAt: z.date(),
});

export type StaffUserDocument = z.input<typeof staffUserDocumentSchema>;
export type RoleDocument = z.input<typeof roleDocumentSchema>;
export type PermissionDocument = z.input<typeof permissionDocumentSchema>;

export function toStaffUser(raw: unknown): StaffUser {
  const { _id, ...rest } = staffUserDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toStaffUserDocument(staff: StaffUser): StaffUserDocument {
  const { id, ...rest } = staff;
  return staffUserDocumentSchema.parse({ _id: id, ...rest });
}

export function toRole(raw: unknown): Role {
  const { _id, ...rest } = roleDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toRoleDocument(role: Role): RoleDocument {
  const { id, ...rest } = role;
  return roleDocumentSchema.parse({ _id: id, ...rest });
}

export function toPermission(raw: unknown): Permission {
  const { _id, ...rest } = permissionDocumentSchema.parse(raw);
  return { key: _id, ...rest };
}
