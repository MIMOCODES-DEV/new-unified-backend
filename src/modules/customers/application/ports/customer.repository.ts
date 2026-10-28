import type { EmailAddress } from '../../../../shared/kernel/email-address.js';
import type { Customer } from '../../domain/customer.js';

/** The current brand's `customers`. */
export abstract class CustomerRepository {
  abstract findById(id: string): Promise<Customer | null>;
  abstract findByEmail(email: EmailAddress): Promise<Customer | null>;
  /** By the old backend's `_id` (`legacy.id`). */
  abstract findByLegacyId(legacyId: string): Promise<Customer | null>;
  /** `email_taken` when the brand already has an account with this email. */
  abstract insert(customer: Customer): Promise<'inserted' | 'email_taken'>;
  /** `missing` when it is not there, `email_taken` when the new email belongs to another account. */
  abstract update(customer: Customer): Promise<'updated' | 'missing' | 'email_taken'>;
}
