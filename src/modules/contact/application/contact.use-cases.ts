import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import { DomainError } from '../../../shared/kernel/domain-error.js';
import { EmailAddress } from '../../../shared/kernel/email-address.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import {
  type ContactMessage,
  MAX_MESSAGE,
  MAX_NAME,
  MAX_SUBJECT,
} from '../domain/contact-message.js';

export class InvalidContactMessageError extends DomainError {
  readonly code = 'contact.invalid_input';
}

/** The current brand's `contactMessages`. */
export abstract class ContactMessageRepository {
  abstract insert(message: ContactMessage): Promise<void>;
  /** Newest first. */
  abstract list(limit: number): Promise<ContactMessage[]>;
}

const optional = (value: string | null | undefined, max: number) => {
  const text = value?.trim() || null;
  return text !== null && text.length > max ? undefined : text;
};

/** The contact form: an email to answer and a message; name and subject are optional. */
@Injectable()
export class SubmitContactMessageUseCase {
  constructor(
    private readonly messages: ContactMessageRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    name?: string | null;
    email: string;
    subject?: string | null;
    message: string;
    ip: string;
    userAgent?: string | null;
  }): Promise<Result<{ id: string }, InvalidContactMessageError>> {
    const email = EmailAddress.parse(input.email);
    if (!email.ok) return err(new InvalidContactMessageError('Invalid email address'));
    const message = input.message.trim();
    if (!message || message.length > MAX_MESSAGE) {
      return err(new InvalidContactMessageError(`A message is 1 to ${MAX_MESSAGE} characters`));
    }
    const name = optional(input.name, MAX_NAME);
    const subject = optional(input.subject, MAX_SUBJECT);
    if (name === undefined || subject === undefined) {
      return err(new InvalidContactMessageError('Name or subject is too long'));
    }
    const saved: ContactMessage = {
      id: randomUUID(),
      name,
      email: email.value.value,
      subject,
      message,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 300) || null,
      createdAt: this.clock.now(),
    };
    await this.messages.insert(saved);
    return ok({ id: saved.id });
  }
}

/** For staff: the brand's latest contact messages. */
@Injectable()
export class ListContactMessagesUseCase {
  constructor(private readonly messages: ContactMessageRepository) {}

  execute(limit = 100): Promise<ContactMessage[]> {
    return this.messages.list(Math.min(Math.max(limit, 1), 500));
  }
}
