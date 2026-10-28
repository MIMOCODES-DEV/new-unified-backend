import type { Migration } from '../../../shared/database/migrations/migration.js';
import { bson, ensureCollection } from '../../../shared/database/migrations/ensure-collection.js';
import { STAFF_STATUSES, SUPER_ADMIN_ROLE_ID } from '../domain/staff.js';
import {
  PERMISSIONS_COLLECTION,
  type PermissionDocument,
  ROLES_COLLECTION,
  type RoleDocument,
  STAFF_USERS_COLLECTION,
} from './staff.documents.js';

const nullableString = () => bson.nullable(bson.string());

/** Day-one roles (DISCUSSIONS #9.5). Fixed ids, so the migration can run again. */
const SEEDED_ROLES: readonly { id: string; name: string; permissions: string[] }[] = [
  { id: 'support', name: 'Support', permissions: ['devices.view'] },
  { id: 'billing', name: 'Billing', permissions: ['devices.view', 'devices.activate'] },
  { id: 'content_editor', name: 'Content editor', permissions: [] },
];

/** The keys the seeded roles list; the startup sync confirms them or turns them off. */
const SEEDED_PERMISSIONS: readonly { key: string; group: string; label: string }[] = [
  { key: 'devices.view', group: 'devices', label: 'View devices' },
  { key: 'devices.activate', group: 'devices', label: 'Activate devices' },
];

/** Central-database migrations owned by the staff module. */
export const staffMigrations: readonly Migration[] = [
  {
    id: '0005-staff',
    description: 'staffUsers, roles (super_admin and three day-one roles) and permissions',
    up: async (db) => {
      await ensureCollection(
        db,
        STAFF_USERS_COLLECTION,
        bson.object({
          _id: bson.string(),
          email: bson.string(),
          passwordHash: bson.string(),
          name: bson.string(),
          roleId: bson.string(),
          tenantAccess: bson.array(bson.string()),
          status: bson.enum(STAFF_STATUSES),
          lastLoginAt: bson.nullable(bson.date()),
          twoFactor: bson.nullable(
            bson.object({ secretEnc: bson.string(), enabledAt: bson.nullable(bson.date()) }),
          ),
          legacyRefs: bson.array(bson.anyObject()),
          createdAt: bson.date(),
          updatedAt: bson.date(),
        }),
        [
          // Emails are stored lowercase, so a plain unique index is case-insensitive.
          { key: { email: 1 }, name: 'email_unique', unique: true },
          { key: { roleId: 1 }, name: 'role' },
        ],
      );
      await ensureCollection(
        db,
        ROLES_COLLECTION,
        bson.object({
          _id: bson.string(),
          name: bson.string(),
          permissions: bson.array(bson.string()),
          system: bson.bool(),
          createdBy: nullableString(),
          createdAt: bson.date(),
          updatedAt: bson.date(),
        }),
        [
          {
            key: { name: 1 },
            name: 'name_unique',
            unique: true,
            // Case does not matter: Support and support are the same role name.
            collation: { locale: 'en', strength: 2 },
          },
        ],
      );
      await ensureCollection(
        db,
        PERMISSIONS_COLLECTION,
        bson.object({
          _id: bson.string(),
          group: bson.string(),
          label: bson.object({ en: bson.string(), ar: nullableString() }),
          description: nullableString(),
          active: bson.bool(),
          syncedAt: bson.date(),
        }),
        [{ key: { group: 1 }, name: 'group' }],
      );

      const now = new Date();
      const roles = db.collection<RoleDocument>(ROLES_COLLECTION);
      const seeded = [
        { id: SUPER_ADMIN_ROLE_ID, name: 'Super admin', permissions: [], system: true },
        ...SEEDED_ROLES.map((r) => ({ ...r, system: false })),
      ];
      for (const role of seeded) {
        await roles.updateOne(
          { _id: role.id },
          {
            $setOnInsert: {
              name: role.name,
              permissions: role.permissions,
              system: role.system,
              createdBy: null,
              createdAt: now,
              updatedAt: now,
            },
          },
          { upsert: true },
        );
      }
      const permissions = db.collection<PermissionDocument>(PERMISSIONS_COLLECTION);
      for (const p of SEEDED_PERMISSIONS) {
        await permissions.updateOne(
          { _id: p.key },
          {
            $setOnInsert: {
              group: p.group,
              label: { en: p.label, ar: null },
              description: null,
              active: true,
              syncedAt: now,
            },
          },
          { upsert: true },
        );
      }
    },
  },
];
