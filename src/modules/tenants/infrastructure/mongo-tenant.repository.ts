import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Db } from 'mongodb';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import { TenantRepository } from '../application/ports/tenant.repository.js';
import type { HostName } from '../domain/host-name.js';
import type { Tenant } from '../domain/tenant.entity.js';
import { type TenantDocument, toTenant, toTenantDocument } from './tenant.document.js';

export const TENANTS_COLLECTION = 'tenants';

@Injectable()
export class MongoTenantRepository extends TenantRepository {
  private readonly collection: Collection<TenantDocument>;

  constructor(@Inject(CENTRAL_DB) db: Db) {
    super();
    this.collection = db.collection<TenantDocument>(TENANTS_COLLECTION);
  }

  async findByHost(host: HostName): Promise<Tenant | null> {
    return this.toEntity(await this.collection.findOne({ hosts: host.value }));
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.toEntity(await this.collection.findOne({ slug }));
  }

  async findAll(): Promise<Tenant[]> {
    const docs = await this.collection.find({}).sort({ slug: 1 }).toArray();
    return docs.map((doc) => toTenant(doc));
  }

  async findTakenHosts(hosts: readonly HostName[]): Promise<string[]> {
    const wanted = hosts.map((h) => h.value);
    const docs = await this.collection
      .find({ hosts: { $in: wanted } }, { projection: { hosts: 1 } })
      .toArray();
    const used = new Set(docs.flatMap((d) => d.hosts));
    return wanted.filter((h) => used.has(h));
  }

  async save(tenant: Tenant): Promise<void> {
    const { _id, createdAt, ...fields } = toTenantDocument(tenant, new Date());
    await this.collection.updateOne(
      { _id },
      { $set: fields, $setOnInsert: { createdAt } },
      { upsert: true },
    );
  }

  private toEntity(doc: TenantDocument | null): Tenant | null {
    return doc ? toTenant(doc) : null;
  }
}
