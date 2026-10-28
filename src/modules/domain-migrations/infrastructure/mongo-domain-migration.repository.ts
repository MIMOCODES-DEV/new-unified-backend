import { Inject, Injectable } from '@nestjs/common';
import { type Collection, type Db, MongoServerError } from 'mongodb';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import { DomainMigrationRepository } from '../application/ports/domain-migration.repository.js';
import type { DomainMigration, MoveConfirmation, MoveStatus } from '../domain/domain-migration.js';
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

  async confirm(
    created: DomainMigration,
    confirmation: MoveConfirmation,
  ): Promise<'created' | 'confirmed' | 'already'> {
    const doc = toDomainMigrationDocument(created);
    // Written only when the move is new; the confirmation and its dates come from $push and $set.
    const onInsert = {
      _id: doc._id,
      kind: doc.kind,
      fromScheme: doc.fromScheme,
      toScheme: doc.toScheme,
      source: doc.source,
      status: doc.status,
      decidedBy: doc.decidedBy,
      decidedAt: doc.decidedAt,
      firstSeenAt: doc.firstSeenAt,
      legacy: doc.legacy,
      createdAt: doc.createdAt,
    };
    const filter = {
      fromHost: doc.fromHost,
      toHost: doc.toHost,
      'confirmations.ipHash': { $ne: confirmation.ipHash },
      'confirmations.deviceId': { $ne: confirmation.deviceId },
    };
    const change = {
      $push: { confirmations: confirmation },
      $set: { lastConfirmedAt: confirmation.at, updatedAt: confirmation.at },
    };
    try {
      // Matches only a move this IP and device have not confirmed yet. When the move exists but
      // they have, the upsert tries to insert a second row and the unique hosts index refuses it.
      const result = await this.collection.updateOne(
        filter,
        { ...change, $setOnInsert: onInsert },
        { upsert: true },
      );
      return result.upsertedCount > 0 ? 'created' : 'confirmed';
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    }
    // Refused by the index: either this IP or device confirmed it before, or another first report
    // created the move at the same moment. Try once more on the row that is there now.
    const retried = await this.collection.updateOne(filter, change);
    return retried.modifiedCount > 0 ? 'confirmed' : 'already';
  }

  async update(move: DomainMigration): Promise<boolean> {
    const doc = toDomainMigrationDocument(move);
    return (await this.collection.replaceOne({ _id: doc._id }, doc)).matchedCount > 0;
  }
}
