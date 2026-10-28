// Public API of the contact module: the only file other modules and interfaces may import.
export { ContactModule } from './contact.module.js';
export { contactMigrations } from './infrastructure/mongo-contact-message.repository.js';
export {
  ListContactMessagesUseCase,
  SubmitContactMessageUseCase,
} from './application/contact.use-cases.js';
