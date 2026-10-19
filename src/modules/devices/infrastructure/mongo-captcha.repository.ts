import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { CaptchaRepository } from '../application/ports/captcha.ports.js';
import { DeviceCaptcha } from '../domain/device-captcha.js';

export const CAPTCHAS_COLLECTION = 'captchas';

/** One document per MAC (_id = MAC). Unanswered ones are deleted by a TTL index on expiresAt. */
interface CaptchaDocument {
  _id: string;
  text: string;
  expiresAt?: Date;
  verifiedAt?: Date;
  token?: string;
  updatedAt: Date;
}

@Injectable()
export class MongoCaptchaRepository extends CaptchaRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<CaptchaDocument>> {
    return this.tenantDb.collection<CaptchaDocument>(CAPTCHAS_COLLECTION);
  }

  async findByMac(mac: MacAddress): Promise<DeviceCaptcha | null> {
    const doc = await (await this.collection()).findOne({ _id: mac.value });
    if (!doc) return null;
    return DeviceCaptcha.restore({
      macAddress: doc._id,
      text: doc.text,
      expiresAt: doc.expiresAt ?? null,
      verifiedAt: doc.verifiedAt ?? null,
      token: doc.token ?? null,
    });
  }

  async save(captcha: DeviceCaptcha): Promise<void> {
    // A verified captcha has no expiresAt, so the TTL index never deletes it.
    const doc: CaptchaDocument = {
      _id: captcha.macAddress,
      text: captcha.text,
      updatedAt: new Date(),
    };
    if (captcha.expiresAt) doc.expiresAt = captcha.expiresAt;
    if (captcha.verifiedAt) doc.verifiedAt = captcha.verifiedAt;
    if (captcha.token) doc.token = captcha.token;
    await (await this.collection()).replaceOne({ _id: doc._id }, doc, { upsert: true });
  }
}
