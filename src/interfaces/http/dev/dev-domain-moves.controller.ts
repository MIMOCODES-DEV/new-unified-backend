import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  DecideHostMoveUseCase,
  ListHostMovesUseCase,
  MOVE_STATUSES,
} from '../../../modules/domain-migrations/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import type { Result } from '../../../shared/kernel/result.js';
import { DevOnlyGuard } from './dev-only.guard.js';

function unwrap<T>(result: Result<T, Error>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

const decider = z.object({ by: z.string() });

/**
 * Dev-only routes to try provider domain moves (DOM-1, DOM-2): list the learned moves and approve
 * or block one, as staff will in the admin API. Moves are central (every brand). 404 in production.
 */
@Controller('dev/domain-moves')
@UseGuards(DevOnlyGuard)
export class DevDomainMovesController {
  constructor(
    private readonly list: ListHostMovesUseCase,
    private readonly decide: DecideHostMoveUseCase,
  ) {}

  /** `awaiting` (the default): pending moves confirmed from 3 IPs; or a status. */
  @Public()
  @Get()
  async all(@Query('filter') filter?: string) {
    const which = parse(z.enum(['awaiting', ...MOVE_STATUSES]).default('awaiting'), filter);
    return this.list.execute(which);
  }

  @Public()
  @Post(':id/approve')
  async approve(@Param('id') id: string, @Body() body: unknown) {
    const { by } = parse(decider, body);
    return unwrap(await this.decide.execute({ id, decision: 'approve', by }));
  }

  @Public()
  @Post(':id/block')
  async block(@Param('id') id: string, @Body() body: unknown) {
    const { by } = parse(decider, body);
    return unwrap(await this.decide.execute({ id, decision: 'block', by }));
  }
}
