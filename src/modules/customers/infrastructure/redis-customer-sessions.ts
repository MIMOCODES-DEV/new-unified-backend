import { Injectable } from '@nestjs/common';
import { SessionStore } from '../../../shared/auth/session-store.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { CustomerSessions } from '../application/ports/customer-outside.js';

/** Customer sessions of the current brand, in the shared session store. */
@Injectable()
export class RedisCustomerSessions extends CustomerSessions {
  constructor(
    private readonly sessions: SessionStore,
    private readonly context: TenantContext,
  ) {
    super();
  }

  async revokeAll(customerId: string): Promise<void> {
    await this.sessions.revokeAll({
      kind: 'customer',
      id: customerId,
      tenantId: this.context.current.id,
    });
  }
}
