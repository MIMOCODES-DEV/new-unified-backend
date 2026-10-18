import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type { HostName } from './host-name.js';
import { InvalidTenantError } from './tenant.errors.js';

export type TenantStatus = 'active' | 'disabled';

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const MAX_NAME_LENGTH = 80;

export interface TenantProps {
  id: string;
  slug: string;
  name: string;
  hosts: HostName[];
  status: TenantStatus;
  dbName: string;
  createdAt: Date;
}

/**
 * A tenant is one brand (ibo, bob, cr7, smart…): its name, the exact host names it answers on,
 * and the database that holds its devices and playlists.
 */
export class Tenant {
  private constructor(private readonly props: TenantProps) {}

  static create(input: {
    id: string;
    slug: string;
    name: string;
    hosts: HostName[];
    now: Date;
  }): Result<Tenant, InvalidTenantError> {
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG.test(slug)) {
      return err(
        new InvalidTenantError('Slug must be 1-32 lowercase letters, digits or hyphens', { slug }),
      );
    }
    const name = input.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return err(new InvalidTenantError('Name must be 1-80 characters', { name: input.name }));
    }
    if (input.hosts.length === 0) {
      return err(new InvalidTenantError('A tenant needs at least one host name'));
    }
    const unique = new Set(input.hosts.map((h) => h.value));
    if (unique.size !== input.hosts.length) {
      return err(new InvalidTenantError('Host names must not repeat'));
    }
    return ok(
      new Tenant({
        id: input.id,
        slug,
        name,
        hosts: [...input.hosts],
        status: 'active',
        dbName: `tenant_${slug.replace(/-/g, '_')}`,
        createdAt: input.now,
      }),
    );
  }

  /** Rebuilds a tenant from storage. Only repositories call this. */
  static restore(props: TenantProps): Tenant {
    return new Tenant({ ...props, hosts: [...props.hosts] });
  }

  get id(): string {
    return this.props.id;
  }
  get slug(): string {
    return this.props.slug;
  }
  get name(): string {
    return this.props.name;
  }
  get hosts(): readonly HostName[] {
    return this.props.hosts;
  }
  get status(): TenantStatus {
    return this.props.status;
  }
  get dbName(): string {
    return this.props.dbName;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get isActive(): boolean {
    return this.props.status === 'active';
  }

  addHost(host: HostName): Result<void, InvalidTenantError> {
    if (this.props.hosts.some((h) => h.equals(host))) {
      return err(
        new InvalidTenantError('Host already belongs to this tenant', { host: host.value }),
      );
    }
    this.props.hosts.push(host);
    return ok(undefined);
  }

  rename(name: string): Result<void, InvalidTenantError> {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      return err(new InvalidTenantError('Name must be 1-80 characters', { name }));
    }
    this.props.name = trimmed;
    return ok(undefined);
  }

  disable(): void {
    this.props.status = 'disabled';
  }
}
