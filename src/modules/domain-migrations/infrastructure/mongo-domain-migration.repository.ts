import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Db } from 'mongodb';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import { DomainMigrationRepository } from '../application/ports/domain-migration.repository.js';
import type { DomainMigration, MoveStatus } from '../domain/domain-migration.js';
import {
  DOMAIN_MIGRATIONS_COLLECTION,
  toDomainMigration,
  toDomainMigrationDocument,
  type DomainMigrationDocument,
} from './domain-migration.document.js';

/** domainMigrations in the central database. */
@Injectable()
export class MongoDomainMigrationRepository extends DomainMigrationRepository {
  private readonly collection: Collection<DomainMigrationDocument>;

  constructor(@Inject(CENTRAL_DB) db: Db) {
    super();
    this.collection = db.collection<DomainMigrationDocument>(DOMAIN_MIGRATIONS_COLLECTION);
  }

  async findById(id: string): Promise<DomainMigration | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toDomainMigration(doc) : null;
  }

  async findByHosts(fromHost: string, toHost: string): Promise<DomainMigration | null> {
    const doc = await this.collection.findOne({ fromHost, toHost });
    return doc ? toDomainMigration(doc) : null;
  }

  async listByStatus(status: MoveStatus): Promise<DomainMigration[]> {
    const docs = await this.collection.find({ status }).sort({ firstSeenAt: 1 }).toArray();
    return docs.map(toDomainMigration);
  }

  async insert(move: DomainMigration): Promise<void> {
    await this.collection.insertOne(toDomainMigrationDocument(move));
  }

  async update(move: DomainMigration): Promise<boolean> {
    const doc = toDomainMigrationDocument(move);
    return (await this.collection.replaceOne({ _id: doc._id }, doc)).matchedCount > 0;
  }
}
