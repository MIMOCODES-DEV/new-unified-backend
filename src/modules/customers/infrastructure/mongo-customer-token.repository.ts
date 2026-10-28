import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { CustomerTokenRepository } from '../application/ports/customer-token.repository.js';
import type { CustomerToken, CustomerTokenKind } from '../domain/customer.js';
import {
  CUSTOMER_TOKENS_COLLECTION,
  type CustomerTokenDocument,
  toCustomerToken,
  toCustomerTokenDocument,
} from './customer.document.js';

/** customerTokens in the current brand's database; expired rows are removed by the TTL index. */
@Injectable()
export class MongoCustomerTokenRepository extends CustomerTokenRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<CustomerTokenDocument>> {
    return this.tenantDb.collection<CustomerTokenDocument>(CUSTOMER_TOKENS_COLLECTION);
  }

  async insert(token: CustomerToken): Promise<void> {
    await (await this.collection()).insertOne(toCustomerTokenDocument(token));
  }

  async take(id: string, kind: CustomerTokenKind, now: Date): Promise<CustomerToken | null> {
    // The TTL index removes expired rows only about once a minute: check the date too.
    const doc = await (
      await this.collection()
    ).findOneAndDelete({ _id: id, kind, expiresAt: { $gt: now } });
    return doc ? toCustomerToken(doc) : null;
  }

  async deleteFor(customerId: string, kind: CustomerTokenKind): Promise<void> {
    await (await this.collection()).deleteMany({ customerId, kind });
  }
}
