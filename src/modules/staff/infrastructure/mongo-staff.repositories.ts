import { Inject, Injectable } from '@nestjs/common';
import { type Collection, type Db, MongoServerError } from 'mongodb';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import type { EmailAddress } from '../../../shared/kernel/email-address.js';
import {
  type DeclaredPermission,
  PermissionRepository,
  RoleRepository,
  StaffUserRepository,
} from '../application/ports/staff.repositories.js';
import type { Permission, Role, StaffUser } from '../domain/staff.js';
import {
  PERMISSIONS_COLLECTION,
  type PermissionDocument,
  ROLES_COLLECTION,
  type RoleDocument,
  STAFF_USERS_COLLECTION,
  type StaffUserDocument,
  toPermission,
  toRole,
  toRoleDocument,
  toStaffUser,
  toStaffUserDocument,
} from './staff.documents.js';

/** Each staff collection has one unique index besides _id (email, role name). */
function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

@Injectable()
export class MongoStaffUserRepository extends StaffUserRepository {
  private readonly collection: Collection<StaffUserDocument>;

  constructor(@Inject(CENTRAL_DB) db: Db) {
    super();
    this.collection = db.collection<StaffUserDocument>(STAFF_USERS_COLLECTION);
  }

  async findById(id: string): Promise<StaffUser | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toStaffUser(doc) : null;
  }

  async findByEmail(email: EmailAddress): Promise<StaffUser | null> {
    const doc = await this.collection.findOne({ email: email.value });
    return doc ? toStaffUser(doc) : null;
  }

  async list(): Promise<StaffUser[]> {
    const docs = await this.collection.find({}).sort({ email: 1 }).toArray();
    return docs.map((doc) => toStaffUser(doc));
  }

  countWithRole(roleId: string): Promise<number> {
    return this.collection.countDocuments({ roleId });
  }

  async insert(staff: StaffUser): Promise<'inserted' | 'email_taken'> {
    try {
      await this.collection.insertOne(toStaffUserDocument(staff));
      return 'inserted';
    } catch (error) {
      if (isDuplicateKey(error)) return 'email_taken';
      throw error;
    }
  }

  async update(staff: StaffUser): Promise<'updated' | 'missing' | 'email_taken'> {
    const doc = toStaffUserDocument(staff);
    try {
      const result = await this.collection.replaceOne({ _id: doc._id }, doc);
      return result.matchedCount > 0 ? 'updated' : 'missing';
    } catch (error) {
      if (isDuplicateKey(error)) return 'email_taken';
      throw error;
    }
  }
}

@Injectable()
export class MongoRoleRepository extends RoleRepository {
  private readonly collection: Collection<RoleDocument>;

  constructor(@Inject(CENTRAL_DB) db: Db) {
    super();
    this.collection = db.collection<RoleDocument>(ROLES_COLLECTION);
  }

  async findById(id: string): Promise<Role | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toRole(doc) : null;
  }

  async list(): Promise<Role[]> {
    const docs = await this.collection.find({}).sort({ name: 1 }).toArray();
    return docs.map((doc) => toRole(doc));
  }

  async insert(role: Role): Promise<'inserted' | 'name_taken'> {
    try {
      await this.collection.insertOne(toRoleDocument(role));
      return 'inserted';
    } catch (error) {
      if (isDuplicateKey(error)) return 'name_taken';
      throw error;
    }
  }

  async update(role: Role): Promise<'updated' | 'missing' | 'name_taken'> {
    const doc = toRoleDocument(role);
    try {
      // The system role is never replaced, whatever the caller checked.
      const result = await this.collection.replaceOne({ _id: doc._id, system: false }, doc);
      return result.matchedCount > 0 ? 'updated' : 'missing';
    } catch (error) {
      if (isDuplicateKey(error)) return 'name_taken';
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id, system: false });
    return result.deletedCount > 0;
  }

  async removePermissions(keys: readonly string[], at: Date): Promise<number> {
    if (keys.length === 0) return 0;
    const result = await this.collection.updateMany(
      { permissions: { $in: [...keys] } },
      { $pull: { permissions: { $in: [...keys] } }, $set: { updatedAt: at } },
    );
    return result.modifiedCount;
  }
}

@Injectable()
export class MongoPermissionRepository extends PermissionRepository {
  private readonly collection: Collection<PermissionDocument>;

  constructor(@Inject(CENTRAL_DB) db: Db) {
    super();
    this.collection = db.collection<PermissionDocument>(PERMISSIONS_COLLECTION);
  }

  async list(): Promise<Permission[]> {
    const docs = await this.collection.find({}).sort({ group: 1, _id: 1 }).toArray();
    return docs.map((doc) => toPermission(doc));
  }

  async findByKey(key: string): Promise<Permission | null> {
    const doc = await this.collection.findOne({ _id: key });
    return doc ? toPermission(doc) : null;
  }

  async upsertDeclared(declared: readonly DeclaredPermission[], at: Date): Promise<void> {
    if (declared.length === 0) return;
    // Upserts are safe when several servers start at once: the same key ends in the same row.
    await this.collection.bulkWrite(
      declared.map((p) => ({
        updateOne: {
          filter: { _id: p.key },
          update: {
            $set: { active: true, syncedAt: at },
            $setOnInsert: { group: p.group, label: { en: p.label, ar: null }, description: null },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async deactivateAllBut(keep: readonly string[], at: Date): Promise<string[]> {
    const gone = await this.collection
      .find({ _id: { $nin: [...keep] }, active: true }, { projection: { _id: 1 } })
      .toArray();
    const keys = gone.map((d) => d._id);
    if (keys.length > 0) {
      await this.collection.updateMany(
        { _id: { $in: keys } },
        { $set: { active: false, syncedAt: at } },
      );
    }
    return keys;
  }

  async edit(
    key: string,
    change: { label?: Permission['label']; description?: string | null; group?: string },
  ): Promise<boolean> {
    const set = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length === 0)
      return (await this.collection.countDocuments({ _id: key })) > 0;
    const result = await this.collection.updateOne({ _id: key }, { $set: set });
    return result.matchedCount > 0;
  }
}
