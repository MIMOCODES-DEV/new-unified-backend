import { SetMetadata } from '@nestjs/common';

export const ACCESS_METADATA = 'unified:access';

/** Who may call a route. Every route must declare exactly one; undeclared routes are refused. */
export type Access =
  | { kind: 'public' }
  | { kind: 'legacy-device' }
  | { kind: 'store' }
  | { kind: 'platform' }
  | {
      kind: 'staff';
      /** The permission key the role must have; null = any active staff member. */
      permission: string | null;
      /** `brand`: the brand served (from the host) must be in the member's tenantAccess. */
      scope: 'brand' | 'central';
    }
  | { kind: 'reseller' }
  | { kind: 'customer' }
  | { kind: 'device-session' };

const access = (value: Access) => SetMetadata(ACCESS_METADATA, value);

/** No authentication (health checks, public content). */
export const Public = () => access({ kind: 'public' });
/** @public Old app protocols: envelope / AES / XOR token, checked by the legacy codecs. */
export const LegacyDevice = () => access({ kind: 'legacy-device' });
/** @public External store calls carrying the per-tenant store `token` header. */
export const Store = () => access({ kind: 'store' });
/** @public Internal platform calls (PLATFORM_KEY). */
export const Platform = () => access({ kind: 'platform' });
/**
 * A staff session acting on the brand being served: the role must have `permission` (PRM-1: the key
 * is synced to `permissions` on startup) and the brand must be in the member's tenantAccess.
 */
export const Staff = (permission: string) => access({ kind: 'staff', permission, scope: 'brand' });
/** A staff session on central data (staff, roles); no brand check. No key = any active member. */
export const CentralStaff = (permission?: string) =>
  access({ kind: 'staff', permission: permission ?? null, scope: 'central' });
/** @public Reseller JWT. */
export const Reseller = () => access({ kind: 'reseller' });
/** A customer session of the brand being served. */
export const Customer = () => access({ kind: 'customer' });
/** A device logged in on the brand site (MAC + device key) of the brand being served. */
export const DeviceSession = () => access({ kind: 'device-session' });
