import { z } from 'zod';
import { ACTIVATION_SOURCES, LICENSE_TYPES, type License } from '../domain/license.js';

export const LICENSES_COLLECTION = 'licenses';

/** Stored shape of a `licenses` row, checked on every read. */
export const licenseDocumentSchema = z
  .object({
    _id: z.string().min(1),
    deviceId: z.string().min(1),
    type: z.enum(LICENSE_TYPES),
    expiresAt: z.date().nullable(),
    revoked: z.boolean(),
    revokedAt: z.date().nullable(),
    activatedBy: z.object({
      source: z.enum(ACTIVATION_SOURCES),
      actorId: z.string().nullable(),
    }),
    creditCost: z.number().int().positive(),
    multiActivate: z.boolean(),
    sourceId: z.string().min(1).nullable(),
    createdAt: z.date(),
  })
  .refine((doc) => (doc.type === 'lifetime') === (doc.expiresAt === null), {
    message: 'A lifetime license has no expiresAt; a yearly one must have it',
    path: ['expiresAt'],
  });

export type LicenseDocument = z.input<typeof licenseDocumentSchema>;

export function toLicense(raw: unknown): License {
  const { _id, ...rest } = licenseDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toLicenseDocument(license: License): LicenseDocument {
  const { id, ...rest } = license;
  return licenseDocumentSchema.parse({ _id: id, ...rest });
}
