import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DomainError } from '../kernel/domain-error.js';

interface ErrorBody {
  error: { code: string; message: string };
}

/**
 * Last line of defence: every error leaves as a small JSON body without stack traces,
 * request config or secrets. Interfaces with their own wire format (legacy, store)
 * catch their errors earlier and never reach this default shape.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const [status, body] = this.toResponse(exception);

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }

  private toResponse(exception: unknown): [number, ErrorBody] {
    if (exception instanceof DomainError) {
      return [
        HttpStatus.UNPROCESSABLE_ENTITY,
        { error: { code: exception.code, message: exception.message } },
      ];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Thrown with our own body (`{ error: { code, message } }`): sent as it is.
      const response = exception.getResponse();
      if (isErrorBody(response)) return [status, response];
      return [status, { error: { code: `http_${status}`, message: exception.message } }];
    }
    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { error: { code: 'internal_error', message: 'Internal server error' } },
    ];
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  const error = (value as Partial<ErrorBody> | null)?.error;
  return typeof error?.code === 'string' && typeof error.message === 'string';
}
