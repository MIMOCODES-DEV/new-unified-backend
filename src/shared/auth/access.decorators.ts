import { SetMetadata } from '@nestjs/common';

export const ACCESS_METADATA = 'unified:access';

/** Who may call a route. Every route must declare exactly one; undeclared routes are refused. */
export type Access =
  | { kind: 'public' }
  | { kind: 'legacy-device' }
  | { kind: 'store' }
  | { kind: 'platform' }
  | { kind: 'staff'; roles: readonly string[] }
  | { kind: 'reseller' }
  | { kind: 'customer' };

const access = (value: Access) => SetMetadata(ACCESS_METADATA, value);

/** No authentication (health checks, public content). */
export const Public = () => access({ kind: 'public' });
/** @public Old app protocols: envelope / AES / XOR token, checked by the legacy codecs. */
export const LegacyDevice = () => access({ kind: 'legacy-device' });
/** @public External store calls carrying the per-tenant store `token` header. */
export const Store = () => access({ kind: 'store' });
/** @public Internal platform calls (PLATFORM_KEY). */
export const Platform = () => access({ kind: 'platform' });
/** @public Staff (admin) JWT, optionally limited to roles. */
export const Staff = (...roles: string[]) => access({ kind: 'staff', roles });
/** @public Reseller JWT. */
export const Reseller = () => access({ kind: 'reseller' });
/** @public Customer website JWT. */
export const Customer = () => access({ kind: 'customer' });
