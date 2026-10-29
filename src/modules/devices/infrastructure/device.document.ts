import { z } from 'zod';
import { API_VERSIONS, PLATFORMS, type PaidDevice, type TrialDevice } from '../domain/device.js';

export const TRIAL_DEVICES_COLLECTION = 'trialDevices';
export const PAID_DEVICES_COLLECTION = 'devices';

/** Normalized MAC, as MacAddress produces it. */
const MAC = /^[0-9a-z]{2}(?::[0-9a-z]{2}){5}$/;

export const legacySchema = z
  .looseObject({ id: z.string().optional(), brand: z.string().optional() })
  .nullable();

/** Fields both device collections store. */
const deviceBaseShape = {
  _id: z.string().min(1),
  macAddress: z.string().regex(MAC),
  appDeviceId: z.string().min(1).nullable(),
  platform: z.enum(PLATFORMS),
  deviceKey: z.string().regex(/^\d{6}$/),
  uid: z.string().min(1).nullable(),
  stalkerEnabled: z.boolean(),
  parentPin: z.string().nullable(),
  apiVersion: z.enum(API_VERSIONS),
  appVersion: z.string().nullable(),
  ip: z.string(),
  lastSeenAt: z.date(),
  legacy: legacySchema,
  createdAt: z.date(),
  updatedAt: z.date(),
};

/** Stored shape of a `trialDevices` row, checked on every read. */
export const trialDeviceDocumentSchema = z.object({
  ...deviceBaseShape,
  trialStartedAt: z.date(),
  trialEndsAt: z.date(),
  playlistCount: z.number().int().min(0),
  firstPlaylistAt: z.date().nullable(),
});

/** Stored shape of a `devices` row, checked on every read. */
export const paidDeviceDocumentSchema = z.object({
  ...deviceBaseShape,
  currentLicenseId: z.string().min(1),
  activatedAt: z.date(),
  resellerId: z.string().nullable(),
  customerId: z.string().nullable(),
  switch: z
    .object({
      from: z.string().regex(MAC),
      to: z.string().regex(MAC),
      at: z.date(),
      originMac: z.string().regex(MAC).nullable(),
      // Rows switched before the count existed made one switch.
      count: z.number().int().min(1).default(1),
    })
    .nullable(),
  recovery: z
    .object({
      code: z.string().nullable(),
      expiresAt: z.date().nullable(),
      enabled: z.boolean(),
      recoveredFrom: z.string().nullable(),
      recoveredAt: z.date().nullable(),
    })
    .nullable(),
});

export type TrialDeviceDocument = z.input<typeof trialDeviceDocumentSchema>;
export type PaidDeviceDocument = z.input<typeof paidDeviceDocumentSchema>;

export function toTrialDevice(raw: unknown): TrialDevice {
  const { _id, ...rest } = trialDeviceDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toTrialDeviceDocument(device: TrialDevice): TrialDeviceDocument {
  const { id, ...rest } = device;
  return trialDeviceDocumentSchema.parse({ _id: id, ...rest });
}

export function toPaidDevice(raw: unknown): PaidDevice {
  const { _id, ...rest } = paidDeviceDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toPaidDeviceDocument(device: PaidDevice): PaidDeviceDocument {
  const { id, ...rest } = device;
  return paidDeviceDocumentSchema.parse({ _id: id, ...rest });
}
