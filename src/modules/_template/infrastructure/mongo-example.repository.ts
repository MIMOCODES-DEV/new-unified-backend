import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Db } from 'mongodb';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
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
 * Adapter implementing the port with MongoDB.
 * Real tenant modules get their `Db` from the tenant context instead of CENTRAL_DB.
 */
@Injectable()
export class MongoExampleRepository extends ExampleRepository {
  private readonly collection: Collection<ExampleDocument>;

  constructor(@Inject(CENTRAL_DB) db: Db) {
    super();
    this.collection = db.collection<ExampleDocument>('examples');
  }

  async findById(id: string): Promise<Example | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? Example.restore({ id: doc._id, name: doc.name, createdAt: doc.createdAt }) : null;
  }

  async save(example: Example): Promise<void> {
    await this.collection.updateOne(
      { _id: example.id },
      {
        $set: { name: example.name, updatedAt: new Date() },
        $setOnInsert: { createdAt: example.createdAt },
      },
      { upsert: true },
    );
  }
}
