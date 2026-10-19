import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { type CaptchaPurpose, CaptchaStore } from '../application/ports/captcha.js';

export const CAPTCHAS_COLLECTION = 'captchas';
/** Captchas live 5 minutes (TTL index on createdAt, see devices.migrations.ts). */
export const CAPTCHA_TTL_SECONDS = 300;

interface CaptchaDocument {
  _id: string; // the token
  purpose: CaptchaPurpose;
  macAddress: string;
  text: string; // expected answer, uppercase
  createdAt: Date;
}

/** Captcha answers in the current brand's database. */
@Injectable()
export class MongoCaptchaStore extends CaptchaStore {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  async create(input: { purpose: CaptchaPurpose; mac: MacAddress; text: string }): Promise<string> {
    const captchas = await this.captchas();
    const token = randomBytes(32).toString('hex'); // same shape as the old backends' tokens
    await captchas.deleteMany({ purpose: input.purpose, macAddress: input.mac.value });
    await captchas.insertOne({
      _id: token,
      purpose: input.purpose,
      macAddress: input.mac.value,
      text: input.text.toUpperCase(),
      createdAt: new Date(),
    });
    return token;
  }

  async consume(input: {
    purpose: CaptchaPurpose;
    mac: MacAddress;
    token: string;
    answer: string;
  }): Promise<boolean> {
    const removed = await (
      await this.captchas()
    ).findOneAndDelete({
      _id: input.token,
      purpose: input.purpose,
      macAddress: input.mac.value,
      text: input.answer.trim().toUpperCase(),
      // The TTL monitor runs about once a minute; never accept an answer older than the TTL.
      createdAt: { $gt: new Date(Date.now() - CAPTCHA_TTL_SECONDS * 1000) },
    });
    return removed !== null;
  }

  private captchas(): Promise<Collection<CaptchaDocument>> {
    return this.tenantDb.collection<CaptchaDocument>(CAPTCHAS_COLLECTION);
  }
}
