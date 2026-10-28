import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingHttpHeaders } from 'node:http';
import { TenantContext } from '../tenancy/tenant-context.js';
import { type Access, ACCESS_METADATA } from './access.decorators.js';
import { AuthContext, bearerToken } from './auth-context.js';
import { SessionStore } from './session-store.js';
import { StaffAccess } from './staff-access.js';

const refuse = (status: 401 | 403, code: string, message: string) =>
  new HttpException({ error: { code, message } }, status);

/**
 * Global guard. Fails closed: a route without an access decorator is refused.
 * Staff, customer and site device routes need a session (`Authorization: Bearer <token>`); a
 * customer or device session works only on its own brand's host. Other kinds get their check when their interface is built.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionStore,
    private readonly staffAccess: StaffAccess,
    private readonly auth: AuthContext,
    private readonly tenant: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!access) {
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} has no access decorator`,
      );
      throw new ForbiddenException();
    }

    if (access.kind === 'public') {
      return true;
    }
    // Old app routes prove who is calling inside the request (encrypted envelope, signature,
    // device token); each route checks that itself, as the old backends did.
    if (access.kind === 'legacy-device') {
      return true;
    }
    if (access.kind === 'staff' || access.kind === 'customer' || access.kind === 'device-session') {
      const headers = context.switchToHttp().getRequest<{ headers: IncomingHttpHeaders }>().headers;
      const token = bearerToken(headers.authorization);
      const session = await this.sessions.find(token);
      if (access.kind === 'device-session') {
        if (session?.kind !== 'device' || !this.tenant.isCurrent(session.tenantId ?? undefined)) {
          throw refuse(401, 'auth.unauthenticated', 'Log in first');
        }
        this.auth.set({ kind: 'device', deviceId: session.id, tenantId: session.tenantId!, token });
        return true;
      }
      if (access.kind === 'customer') {
        if (session?.kind !== 'customer' || !this.tenant.isCurrent(session.tenantId ?? undefined)) {
          throw refuse(401, 'auth.unauthenticated', 'Log in first');
        }
        this.auth.set({
          kind: 'customer',
          customerId: session.id,
          tenantId: session.tenantId!,
          token,
        });
        return true;
      }
      if (session?.kind !== 'staff') throw refuse(401, 'auth.unauthenticated', 'Log in first');
      const brandSlug = access.scope === 'brand' ? this.tenant.current.slug : null;
      const decision = await this.staffAccess.check(session.id, access.permission, brandSlug);
      if (!decision.allowed) throw refuse(decision.status, decision.code, decision.message);
      this.auth.set({ kind: 'staff', staffId: session.id, token });
      return true;
    }

    throw new NotImplementedException(`Access kind "${access.kind}" is not implemented yet`);
  }
}
