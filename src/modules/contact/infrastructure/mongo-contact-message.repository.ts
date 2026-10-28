import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { z } from 'zod';
import type { Migration } from '../../../shared/database/migrations/migration.js';
import { bson, ensureCollection } from '../../../shared/database/migrations/ensure-collection.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { ContactMessageRepository } from '../application/contact.use-cases.js';
import type { ContactMessage } from '../domain/contact-message.js';

const CONTACT_MESSAGES_COLLECTION = 'contactMessages';

const contactMessageDocumentSchema = z.object({
  _id: z.string().min(1),
  name: z.string().nullable(),
  email: z.string().min(1),
  subject: z.string().nullable(),
  message: z.string().min(1),
  ip: z.string(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
});

type ContactMessageDocument = z.input<typeof contactMessageDocumentSchema>;

function toContactMessage(raw: unknown): ContactMessage {
  const { _id, ...rest } = contactMessageDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

/** contactMessages in the current brand's database. */
@Injectable()
export class MongoContactMessageRepository extends ContactMessageRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<ContactMessageDocument>> {
    return this.tenantDb.collection<ContactMessageDocument>(CONTACT_MESSAGES_COLLECTION);
  }

  async insert(message: ContactMessage): Promise<void> {
    const { id, ...rest } = message;
    await (
      await this.collection()
    ).insertOne(contactMessageDocumentSchema.parse({ _id: id, ...rest }));
  }

  async list(limit: number): Promise<ContactMessage[]> {
    const docs = await (
      await this.collection()
    )
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((doc) => toContactMessage(doc));
  }
}

const nullableString = () => bson.nullable(bson.string());

/** Brand-database migrations owned by the contact module. */
export const contactMigrations: readonly Migration[] = [
  {
    id: '0011-contact-messages',
    description: 'contactMessages: the brand site contact form, newest first for staff',
    up: (db) =>
      ensureCollection(
        db,
        CONTACT_MESSAGES_COLLECTION,
        bson.object({
          _id: bson.string(),
          name: nullableString(),
          email: bson.string(),
          subject: nullableString(),
          message: bson.string(),
          ip: bson.string(),
          userAgent: nullableString(),
          createdAt: bson.date(),
        }),
        [{ key: { createdAt: -1 }, name: 'created_at' }],
      ),
  },
];
