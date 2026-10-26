import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Access, ACCESS_METADATA } from './access.decorators.js';

/**
 * Global guard. Fails closed: a route without an access decorator is refused.
 * Each access kind gets its real check when its interface is built (tasks TEN, IDN, LEG, STO).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    throw new NotImplementedException(`Access kind "${access.kind}" is not implemented yet`);
  }
}
