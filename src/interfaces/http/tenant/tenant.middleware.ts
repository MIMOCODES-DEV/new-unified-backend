import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpStatus, Injectable, type NestMiddleware } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ResolveTenantUseCase } from '../../../modules/tenants/index.js';
import { CURRENT_TENANT, type CurrentTenant } from '../../../shared/tenancy/current-tenant.js';

const STATUS_BY_CODE: Record<string, number> = {
  'tenants.invalid_host': HttpStatus.BAD_REQUEST,
  'tenants.unknown_host': HttpStatus.MISDIRECTED, // 421: this server is not configured for that host
  'tenants.disabled': HttpStatus.FORBIDDEN,
};

/**
 * Runs before every route (except health checks): finds the brand from the Host header and stores it
 * in the request context, so any code later in the request can ask "which brand am I serving?".
 * An unknown host is refused — never served as some default brand.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly resolveTenant: ResolveTenantUseCase,
    private readonly cls: ClsService,
  ) {}

  async use(req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> {
    const result = await this.resolveTenant.execute(req.headers.host);

    if (!result.ok) {
      res.statusCode = STATUS_BY_CODE[result.error.code] ?? HttpStatus.BAD_REQUEST;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({ error: { code: result.error.code, message: result.error.message } }),
      );
      return;
    }

    const tenant = result.value;
    const current: CurrentTenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      dbName: tenant.dbName,
    };
    this.cls.set(CURRENT_TENANT, current);
    next();
  }
}
