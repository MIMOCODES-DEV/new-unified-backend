import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { EmailAddress } from '../../../../shared/kernel/email-address.js';
import { isAcceptablePassword, PasswordHasher } from '../../../../shared/kernel/password-hasher.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Customer } from '../../domain/customer.js';
import {
  CustomerEmailTakenError,
  CustomerNotFoundError,
  EmailNotVerifiedError,
  InvalidCustomerCredentialsError,
  InvalidCustomerInputError,
  InvalidLinkError,
} from '../../domain/customer.errors.js';
import { CustomerLinks } from '../customer-links.js';
import { CustomerMailer, CustomerSessions } from '../ports/customer-outside.js';
import { CustomerRepository } from '../ports/customer.repository.js';

const PASSWORD_RULE = 'A password must be 8 to 128 characters';

/** Empty or blank = no name. */
const optionalName = (value: string | null | undefined) => value?.trim() || null;

/** CUS-1: a new account in the current brand, not verified until the emailed link is opened. */
@Injectable()
export class SignUpCustomerUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly hasher: PasswordHasher,
    private readonly links: CustomerLinks,
    private readonly mailer: CustomerMailer,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    email: string;
    password: string;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<Result<Customer, InvalidCustomerInputError | CustomerEmailTakenError>> {
    const email = EmailAddress.parse(input.email);
    if (!email.ok) return err(new InvalidCustomerInputError('Invalid email address'));
    if (!isAcceptablePassword(input.password)) {
      return err(new InvalidCustomerInputError(PASSWORD_RULE));
    }
    const now = this.clock.now();
    const customer: Customer = {
      id: randomUUID(),
      email: email.value.value,
      passwordHash: await this.hasher.hash(input.password),
      firstName: optionalName(input.firstName),
      lastName: optionalName(input.lastName),
      emailVerifiedAt: null,
      legacy: null,
      createdAt: now,
      updatedAt: now,
    };
    if ((await this.customers.insert(customer)) === 'email_taken') {
      return err(new CustomerEmailTakenError('An account with this email already exists'));
    }
    await this.mailer.sendEmailVerification(
      customer.email,
      await this.links.issue(customer, 'verifyEmail'),
    );
    return ok(customer);
  }
}

/** CUS-1/CUS-4: the emailed link sets `emailVerifiedAt`, for the address it was sent to only. */
@Injectable()
export class VerifyCustomerEmailUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly links: CustomerLinks,
    private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<Result<Customer, InvalidLinkError>> {
    const invalid = new InvalidLinkError('This link is not valid any more');
    const link = await this.links.take(token, 'verifyEmail');
    const customer = link ? await this.customers.findById(link.customerId) : null;
    // A link sent to an older address proves nothing about the current one.
    if (!link || !customer || customer.email !== link.email) return err(invalid);
    if (customer.emailVerifiedAt) return ok(customer);
    const now = this.clock.now();
    const verified = { ...customer, emailVerifiedAt: now, updatedAt: now };
    await this.customers.update(verified);
    return ok(verified);
  }
}

/** A new verification link for a logged-in customer whose email is not verified yet. */
@Injectable()
export class ResendVerificationUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly links: CustomerLinks,
    private readonly mailer: CustomerMailer,
  ) {}

  async execute(customerId: string): Promise<Result<{ sent: boolean }, CustomerNotFoundError>> {
    const customer = await this.customers.findById(customerId);
    if (!customer) return err(new CustomerNotFoundError('Account not found'));
    if (customer.emailVerifiedAt) return ok({ sent: false });
    await this.mailer.sendEmailVerification(
      customer.email,
      await this.links.issue(customer, 'verifyEmail'),
    );
    return ok({ sent: true });
  }
}

/**
 * CUS-2: email and password, in the current brand only. A wrong password and an unknown email give
 * the same error and take about the same time.
 */
@Injectable()
export class CustomerLoginUseCase {
  private decoy: Promise<string> | null = null;

  constructor(
    private readonly customers: CustomerRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: {
    email: string;
    password: string;
  }): Promise<Result<Customer, InvalidCustomerCredentialsError | EmailNotVerifiedError>> {
    const invalid = new InvalidCustomerCredentialsError('Email or password is not correct');
    const email = EmailAddress.parse(input.email);
    const customer = email.ok ? await this.customers.findByEmail(email.value) : null;
    if (!customer) {
      await this.hasher.verify(input.password, await (this.decoy ??= this.hasher.hash('decoy')));
      return err(invalid);
    }
    if (!(await this.hasher.verify(input.password, customer.passwordHash))) return err(invalid);
    if (!customer.emailVerifiedAt) {
      return err(new EmailNotVerifiedError('Open the link we emailed you first'));
    }
    return ok(customer);
  }
}

/** CUS-2: always the same answer, so nobody can probe which emails have an account. */
@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly links: CustomerLinks,
    private readonly mailer: CustomerMailer,
  ) {}

  async execute(rawEmail: string): Promise<void> {
    const email = EmailAddress.parse(rawEmail);
    const customer = email.ok ? await this.customers.findByEmail(email.value) : null;
    if (!customer) return;
    await this.mailer.sendPasswordReset(
      customer.email,
      await this.links.issue(customer, 'resetPassword'),
    );
  }
}

/**
 * CUS-2: the emailed link sets a new password and logs out every session. Opening it also proves
 * the email, so an unverified account becomes verified.
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly links: CustomerLinks,
    private readonly hasher: PasswordHasher,
    private readonly sessions: CustomerSessions,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    token: string;
    password: string;
  }): Promise<Result<{ reset: true }, InvalidCustomerInputError | InvalidLinkError>> {
    // Checked first, so a weak password does not use up the link.
    if (!isAcceptablePassword(input.password)) {
      return err(new InvalidCustomerInputError(PASSWORD_RULE));
    }
    const link = await this.links.take(input.token, 'resetPassword');
    const customer = link ? await this.customers.findById(link.customerId) : null;
    if (!link || !customer || customer.email !== link.email) {
      return err(new InvalidLinkError('This link is not valid any more'));
    }
    const now = this.clock.now();
    await this.customers.update({
      ...customer,
      passwordHash: await this.hasher.hash(input.password),
      emailVerifiedAt: customer.emailVerifiedAt ?? now,
      updatedAt: now,
    });
    await this.sessions.revokeAll(customer.id);
    return ok({ reset: true });
  }
}

@Injectable()
export class GetCustomerUseCase {
  constructor(private readonly customers: CustomerRepository) {}

  async execute(id: string): Promise<Result<Customer, CustomerNotFoundError>> {
    const customer = await this.customers.findById(id);
    return customer ? ok(customer) : err(new CustomerNotFoundError('Account not found'));
  }
}

export interface UpdateProfileInput {
  customerId: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  newPassword?: string;
  /** Needed to change the email or the password. */
  currentPassword?: string;
}

/**
 * CUS-4: name, email and password. A new email is not verified until its link is opened; a new
 * password logs out the other sessions.
 */
@Injectable()
export class UpdateCustomerProfileUseCase {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly hasher: PasswordHasher,
    private readonly links: CustomerLinks,
    private readonly mailer: CustomerMailer,
    private readonly sessions: CustomerSessions,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: UpdateProfileInput,
  ): Promise<
    Result<
      Customer,
      | CustomerNotFoundError
      | InvalidCustomerInputError
      | InvalidCustomerCredentialsError
      | CustomerEmailTakenError
    >
  > {
    const customer = await this.customers.findById(input.customerId);
    if (!customer) return err(new CustomerNotFoundError('Account not found'));
    let next: Customer = { ...customer };
    if (input.firstName !== undefined) next = { ...next, firstName: optionalName(input.firstName) };
    if (input.lastName !== undefined) next = { ...next, lastName: optionalName(input.lastName) };

    let newEmail: string | null = null;
    if (input.email !== undefined) {
      const email = EmailAddress.parse(input.email);
      if (!email.ok) return err(new InvalidCustomerInputError('Invalid email address'));
      if (email.value.value !== customer.email) newEmail = email.value.value;
    }
    if (input.newPassword !== undefined && !isAcceptablePassword(input.newPassword)) {
      return err(new InvalidCustomerInputError(PASSWORD_RULE));
    }
    if (newEmail !== null || input.newPassword !== undefined) {
      const current = input.currentPassword ?? '';
      if (!(await this.hasher.verify(current, customer.passwordHash))) {
        return err(new InvalidCustomerCredentialsError('The current password is not correct'));
      }
    }
    if (newEmail !== null) next = { ...next, email: newEmail, emailVerifiedAt: null };
    if (input.newPassword !== undefined) {
      next = { ...next, passwordHash: await this.hasher.hash(input.newPassword) };
    }
    next = { ...next, updatedAt: this.clock.now() };

    const saved = await this.customers.update(next);
    if (saved === 'missing') return err(new CustomerNotFoundError('Account not found'));
    if (saved === 'email_taken') {
      return err(new CustomerEmailTakenError('An account with this email already exists'));
    }
    if (newEmail !== null) {
      await this.mailer.sendEmailVerification(
        newEmail,
        await this.links.issue(next, 'verifyEmail'),
      );
    }
    if (input.newPassword !== undefined) await this.sessions.revokeAll(customer.id);
    return ok(next);
  }
}
