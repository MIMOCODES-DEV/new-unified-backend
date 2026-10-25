import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Db } from 'mongodb';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import type { EncryptedSecret } from '../application/ports/secret-cipher.js';
import {
  TenantSecretRepository,
  type TenantSecretSummary,
} from '../application/ports/tenant-secret.repository.js';

export const TENANT_SECRETS_COLLECTION = 'tenantSecrets';

/** Stored shape: one document per brand and secret name. `secret` is ciphertext only. */
interface TenantSecretDocument {
  tenantId: string;
  name: string;
  secret: EncryptedSecret;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MongoTenantSecretRepository extends TenantSecretRepository {
  private readonly collection: Collection<TenantSecretDocument>;

  constructor(@Inject(CENTRAL_DB) db: Db) {
    super();
    this.collection = db.collection<TenantSecretDocument>(TENANT_SECRETS_COLLECTION);
  }

  async find(tenantId: string, name: string): Promise<EncryptedSecret | null> {
    const doc = await this.collection.findOne(
      { tenantId, name },
      { projection: { _id: 0, secret: 1 } },
    );
    return doc?.secret ?? null;
  }

  async list(tenantId: string): Promise<TenantSecretSummary[]> {
    return this.collection
      .find({ tenantId }, { projection: { _id: 0, name: 1, updatedAt: 1 } })
      .sort({ name: 1 })
      .map((doc) => ({ name: doc.name, updatedAt: doc.updatedAt }))
      .toArray();
  }

  async save(tenantId: string, name: string, secret: EncryptedSecret, now: Date): Promise<void> {
    await this.collection.updateOne(
      { tenantId, name },
      { $set: { secret, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }

  async delete(tenantId: string, name: string): Promise<boolean> {
    return (await this.collection.deleteOne({ tenantId, name })).deletedCount > 0;
  }
}
