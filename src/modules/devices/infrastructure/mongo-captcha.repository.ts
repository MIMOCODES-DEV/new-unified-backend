import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { CaptchaRepository } from '../application/ports/captcha.repository.js';
import type { Captcha, CaptchaKind } from '../domain/captcha.js';
import {
  CAPTCHAS_COLLECTION,
  toCaptcha,
  toCaptchaDocument,
  type CaptchaDocument,
} from './captcha.document.js';

/** captchas in the current brand's database. Unanswered rows are removed by the TTL index. */
@Injectable()
export class MongoCaptchaRepository extends CaptchaRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<CaptchaDocument>> {
    return this.tenantDb.collection<CaptchaDocument>(CAPTCHAS_COLLECTION);
  }

  async findByToken(token: string): Promise<Captcha | null> {
    const doc = await (await this.collection()).findOne({ token });
    return doc ? toCaptcha(doc) : null;
  }

  async findSolved(mac: MacAddress, kind: CaptchaKind): Promise<Captcha | null> {
    const doc = await (
      await this.collection()
    ).findOne(
      { macAddress: mac.value, kind, verifiedAt: { $ne: null } },
      { sort: { verifiedAt: -1 } },
    );
    return doc ? toCaptcha(doc) : null;
  }

  async findOpen(mac: MacAddress, kind: CaptchaKind, now: Date): Promise<Captcha | null> {
    const doc = await (
      await this.collection()
    ).findOne(
      { macAddress: mac.value, kind, verifiedAt: null, expiresAt: { $gt: now } },
      { sort: { createdAt: -1 } },
    );
    return doc ? toCaptcha(doc) : null;
  }

  async insert(captcha: Captcha): Promise<void> {
    await (await this.collection()).insertOne(toCaptchaDocument(captcha));
  }

  async markSolved(id: string, at: Date): Promise<boolean> {
    const result = await (
      await this.collection()
    ).updateOne({ _id: id, verifiedAt: null }, { $set: { verifiedAt: at, expiresAt: null } });
    return result.modifiedCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    return (await (await this.collection()).deleteOne({ _id: id })).deletedCount > 0;
  }

  async update(captcha: Captcha): Promise<boolean> {
    const doc = toCaptchaDocument(captcha);
    return (await (await this.collection()).replaceOne({ _id: doc._id }, doc)).matchedCount > 0;
  }
}
