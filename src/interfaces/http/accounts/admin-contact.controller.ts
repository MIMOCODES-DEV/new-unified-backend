import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ListContactMessagesUseCase } from '../../../modules/contact/index.js';
import { Staff } from '../../../shared/auth/access.decorators.js';
import { parse } from './http-results.js';

/** The contact form's messages of the brand being served (the host), newest first. */
@Controller('admin/contact-messages')
export class AdminContactController {
  constructor(private readonly listMessages: ListContactMessagesUseCase) {}

  @Staff('contact.view')
  @Get()
  async list(@Query('limit') limit?: string) {
    const max = parse(z.coerce.number().int().min(1).max(500).default(100), limit);
    return { messages: await this.listMessages.execute(max) };
  }
}
