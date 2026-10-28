import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

const AUTH = 'unified:auth';

/** Who the guard let in, for the rest of the request. */
export type Caller =
  | { readonly kind: 'staff'; readonly staffId: string; readonly token: string }
  | {
      readonly kind: 'customer';
      readonly customerId: string;
      readonly tenantId: string;
      readonly token: string;
    }
  | {
      readonly kind: 'device';
      readonly deviceId: string;
      readonly tenantId: string;
      readonly token: string;
    };

/** The caller of the current request, set by AccessGuard. */
@Injectable()
export class AuthContext {
  constructor(private readonly cls: ClsService) {}

  set(caller: Caller): void {
    this.cls.set(AUTH, caller);
  }

  /** The staff member; throws on a route not marked for staff (a bug). */
  staff(): Extract<Caller, { kind: 'staff' }> {
    const caller = this.cls.get<Caller | undefined>(AUTH);
    if (caller?.kind !== 'staff') throw new Error('No staff caller: route is not a staff route');
    return caller;
  }

  /** The device of a site device session; throws on a route not marked for it (a bug). */
  device(): Extract<Caller, { kind: 'device' }> {
    const caller = this.cls.get<Caller | undefined>(AUTH);
    if (caller?.kind !== 'device') throw new Error('No device caller: route is not a device route');
    return caller;
  }

  /** The customer; throws on a route not marked for customers (a bug). */
  customer(): Extract<Caller, { kind: 'customer' }> {
    const caller = this.cls.get<Caller | undefined>(AUTH);
    if (caller?.kind !== 'customer') {
      throw new Error('No customer caller: route is not a customer route');
    }
    return caller;
  }
}

/** The session token from `Authorization: Bearer <token>`, or empty. */
export function bearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)$/i.exec(value ?? '');
  return match?.[1] ?? '';
}
