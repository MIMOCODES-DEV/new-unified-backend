import { z } from 'zod';
import { CAPTCHA_KINDS, type Captcha } from '../domain/captcha.js';

export const CAPTCHAS_COLLECTION = 'captchas';

/** Stored shape of a `captchas` row, checked on every read. */
export const captchaDocumentSchema = z.object({
  _id: z.string().min(1),
  token: z.string().min(1),
  kind: z.enum(CAPTCHA_KINDS),
  /** Normalized, as MacAddress produces it: findSolved looks it up that way. */
  macAddress: z
    .string()
    .regex(/^[0-9a-z]{2}(?::[0-9a-z]{2}){5}$/)
    .nullable(),
  appDeviceId: z.string().nullable(),
  platform: z.string().nullable(),
  answerHash: z.string().min(1),
  verifiedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});

export type CaptchaDocument = z.input<typeof captchaDocumentSchema>;

export function toCaptcha(raw: unknown): Captcha {
  const { _id, ...rest } = captchaDocumentSchema.parse(raw);
  return { id: _id, ...rest };
}

export function toCaptchaDocument(captcha: Captcha): CaptchaDocument {
  const { id, ...rest } = captcha;
  return captchaDocumentSchema.parse({ _id: id, ...rest });
}
