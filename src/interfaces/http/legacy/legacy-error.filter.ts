import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';

/** The part of Fastify's reply object this filter uses. */
interface Reply {
  status(code: number): { send(body: unknown): unknown };
}

/**
 * Old apps read error bodies in the old shapes ({status, message} or {data: <envelope>}).
 * The legacy controllers throw HttpException with that exact body; this filter sends it as is,
 * instead of the new API's {error: {code, message}} (GlobalExceptionFilter).
 * Other errors (bugs) still go to the global filter: a plain 500 without details.
 */
@Catch(HttpException)
export class LegacyErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    void host
      .switchToHttp()
      .getResponse<Reply>()
      .status(exception.getStatus())
      .send(exception.getResponse());
  }
}
