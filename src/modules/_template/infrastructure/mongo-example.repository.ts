import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { ExampleRepository } from '../application/ports/example.repository.js';
import { Example } from '../domain/example.entity.js';

/** Stored shape: camelCase, real types. Mapping to/from the entity stays in this file. */
interface ExampleDocument {
  _id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Adapter implementing the port with MongoDB, in the current brand's database.
 * The collection is fetched on every call: this object is created once, but each request
 * may be for a different brand. (Central-database modules inject CENTRAL_DB instead.)
 */
@Injectable()
export class MongoExampleRepository extends ExampleRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<ExampleDocument>> {
    return this.tenantDb.collection<ExampleDocument>('examples');
  }

  async findById(id: string): Promise<Example | null> {
    const doc = await (await this.collection()).findOne({ _id: id });
    return doc ? Example.restore({ id: doc._id, name: doc.name, createdAt: doc.createdAt }) : null;
  }

  async save(example: Example): Promise<void> {
    await (
      await this.collection()
    ).updateOne(
      { _id: example.id },
      {
        $set: { name: example.name, updatedAt: new Date() },
        $setOnInsert: { createdAt: example.createdAt },
      },
      { upsert: true },
    );
  }
}
