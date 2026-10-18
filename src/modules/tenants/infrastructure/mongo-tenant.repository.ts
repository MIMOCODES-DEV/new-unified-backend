import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Db } from 'mongodb';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import { TenantRepository } from '../application/ports/tenant.repository.js';
import { HostName } from '../domain/host-name.js';
import { Tenant, type TenantStatus } from '../domain/tenant.entity.js';

export const TENANTS_COLLECTION = 'tenants';

/** Stored shape of a tenant in the central database. */
interface TenantDocument {
  _id: string;
  slug: string;
  name: string;
  hosts: string[];
  status: TenantStatus;
  dbName: string;
  createdAt: Date;
  updatedAt: Date;
}

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

  async findTakenHosts(hosts: readonly HostName[]): Promise<string[]> {
    const wanted = hosts.map((h) => h.value);
    const docs = await this.collection
      .find({ hosts: { $in: wanted } }, { projection: { hosts: 1 } })
      .toArray();
    const used = new Set(docs.flatMap((d) => d.hosts));
    return wanted.filter((h) => used.has(h));
  }

  async save(tenant: Tenant): Promise<void> {
    await this.collection.updateOne(
      { _id: tenant.id },
      {
        $set: {
          slug: tenant.slug,
          name: tenant.name,
          hosts: tenant.hosts.map((h) => h.value),
          status: tenant.status,
          dbName: tenant.dbName,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: tenant.createdAt },
      },
      { upsert: true },
    );
  }

  private toEntity(doc: TenantDocument | null): Tenant | null {
    if (!doc) return null;
    return Tenant.restore({
      id: doc._id,
      slug: doc.slug,
      name: doc.name,
      // Stored hosts were validated on save; a bad one here means the data was edited by hand.
      hosts: doc.hosts.map((h) => {
        const parsed = HostName.parse(h);
        if (!parsed.ok) throw parsed.error;
        return parsed.value;
      }),
      status: doc.status,
      dbName: doc.dbName,
      createdAt: doc.createdAt,
    });
  }
}
