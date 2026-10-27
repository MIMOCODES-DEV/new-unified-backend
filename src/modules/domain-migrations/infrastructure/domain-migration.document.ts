import { z } from 'zod';
import {
  MOVE_KINDS,
  MOVE_SOURCES,
  MOVE_STATUSES,
  SCHEMES,
  type DomainMigration,
} from '../domain/domain-migration.js';

export const DOMAIN_MIGRATIONS_COLLECTION = 'domainMigrations';

/** Lowercase host with an optional port. */
const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/;

/** Stored shape of a `domainMigrations` row, checked on every read. */
export const domainMigrationDocumentSchema = z.object({
  _id: z.string().min(1),
  kind: z.enum(MOVE_KINDS),
  fromHost: z.string().regex(HOST),
  toHost: z.string().regex(HOST),
  fromScheme: z.enum(SCHEMES),
  toScheme: z.enum(SCHEMES),
  confirmations: z.array(
    z.object({
      tenantId: z.string().min(1),
      deviceId: z.string().min(1),
      ipHash: z.string().min(1),
      at: z.date(),
    }),
  ),
  source: z.enum(MOVE_SOURCES),
  status: z.enum(MOVE_STATUSES),
  decidedBy: z.string().nullable(),
  decidedAt: z.date().nullable(),
  firstSeenAt: z.date(),
  lastConfirmedAt: z.date(),
  legacy: z.looseObject({ id: z.string().optional() }).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DomainMigrationDocument = z.input<typeof domainMigrationDocumentSchema>;

export function toDomainMigration(raw: unknown): DomainMigration {
  const { _id, ...rest } = domainMigrationDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toDomainMigrationDocument(move: DomainMigration): DomainMigrationDocument {
  const { id, ...rest } = move;
  return domainMigrationDocumentSchema.parse({ _id: id, ...rest });
}
