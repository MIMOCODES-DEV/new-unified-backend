import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import {
  ContactMessageRepository,
  ListContactMessagesUseCase,
  SubmitContactMessageUseCase,
} from './application/contact.use-cases.js';
import { MongoContactMessageRepository } from './infrastructure/mongo-contact-message.repository.js';

const useCases = [SubmitContactMessageUseCase, ListContactMessagesUseCase];

/** The brand sites' contact form. Needs DatabaseModule and TenancyModule (global). */
@Module({
  providers: [
    ...useCases,
    { provide: Clock, useClass: SystemClock },
    { provide: ContactMessageRepository, useClass: MongoContactMessageRepository },
  ],
  exports: useCases,
})
export class ContactModule {}
