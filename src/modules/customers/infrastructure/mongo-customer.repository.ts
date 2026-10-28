import { Injectable } from '@nestjs/common';
import { type Collection, MongoServerError } from 'mongodb';
import type { EmailAddress } from '../../../shared/kernel/email-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { CustomerRepository } from '../application/ports/customer.repository.js';
import type { Customer } from '../domain/customer.js';
import {
  CUSTOMERS_COLLECTION,
  type CustomerDocument,
  toCustomer,
  toCustomerDocument,
} from './customer.document.js';

/** customers in the current brand's database. The collection is looked up on every call. */
@Injectable()
export class MongoCustomerRepository extends CustomerRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<CustomerDocument>> {
    return this.tenantDb.collection<CustomerDocument>(CUSTOMERS_COLLECTION);
  }

  async findById(id: string): Promise<Customer | null> {
    const doc = await (await this.collection()).findOne({ _id: id });
    return doc ? toCustomer(doc) : null;
  }

  async findByEmail(email: EmailAddress): Promise<Customer | null> {
    const doc = await (await this.collection()).findOne({ email: email.value });
    return doc ? toCustomer(doc) : null;
  }

  async findByLegacyId(legacyId: string): Promise<Customer | null> {
    const doc = await (await this.collection()).findOne({ 'legacy.id': legacyId });
    return doc ? toCustomer(doc) : null;
  }

  async insert(customer: Customer): Promise<'inserted' | 'email_taken'> {
    try {
      await (await this.collection()).insertOne(toCustomerDocument(customer));
      return 'inserted';
    } catch (error) {
      if (isDuplicateKey(error)) return 'email_taken';
      throw error;
    }
  }

  async update(customer: Customer): Promise<'updated' | 'missing' | 'email_taken'> {
    const doc = toCustomerDocument(customer);
    try {
      const result = await (await this.collection()).replaceOne({ _id: doc._id }, doc);
      return result.matchedCount > 0 ? 'updated' : 'missing';
    } catch (error) {
      if (isDuplicateKey(error)) return 'email_taken';
      throw error;
    }
  }
}

/** The only unique index besides _id is `email_unique`. */
function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}
