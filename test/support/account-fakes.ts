import type { CustomerTokenRepository } from '../../src/modules/customers/application/ports/customer-token.repository.js';
import type { CustomerRepository } from '../../src/modules/customers/application/ports/customer.repository.js';
import type {
  CustomerMailer,
  CustomerSessions,
} from '../../src/modules/customers/application/ports/customer-outside.js';
import type {
  Customer,
  CustomerToken,
  CustomerTokenKind,
} from '../../src/modules/customers/domain/customer.js';
import type {
  StaffSessions,
  TwoFactorSecretCipher,
} from '../../src/modules/staff/application/ports/staff-security.js';
import type {
  DeclaredPermission,
  PermissionRepository,
  RoleRepository,
  StaffUserRepository,
} from '../../src/modules/staff/application/ports/staff.repositories.js';
import type { Permission, Role, StaffUser } from '../../src/modules/staff/domain/staff.js';
import type { EmailAddress } from '../../src/shared/kernel/email-address.js';
import { PasswordHasher } from '../../src/shared/kernel/password-hasher.js';

const at = new Date('2026-10-28T10:00:00Z');

/** Fast and readable: `hashed:<password>`. */
export class PlainPasswordHasher extends PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }

  verify(password: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${password}`);
  }
}

export function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    email: 'ana@example.com',
    passwordHash: 'hashed:secret-pass',
    firstName: 'Ana',
    lastName: null,
    emailVerifiedAt: at,
    legacy: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export function staffUser(overrides: Partial<StaffUser> = {}): StaffUser {
  return {
    id: 'staff-1',
    email: 'sam@example.com',
    passwordHash: 'hashed:staff-pass',
    name: 'Sam',
    roleId: 'billing',
    tenantAccess: ['ibo'],
    status: 'active',
    lastLoginAt: null,
    twoFactor: null,
    legacyRefs: [],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export function role(overrides: Partial<Role> = {}): Role {
  return {
    id: 'billing',
    name: 'Billing',
    permissions: ['devices.activate', 'devices.view'],
    system: false,
    createdBy: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export const superAdminRole = () =>
  role({ id: 'super_admin', name: 'Super admin', permissions: [], system: true });

export function permission(key: string, overrides: Partial<Permission> = {}): Permission {
  return {
    key,
    group: key.split('.')[0]!,
    label: { en: key, ar: null },
    description: null,
    active: true,
    syncedAt: at,
    ...overrides,
  };
}

export class InMemoryCustomerRepository implements CustomerRepository {
  readonly items = new Map<string, Customer>();

  private emailTaken(c: Customer): boolean {
    return [...this.items.values()].some((o) => o.email === c.email && o.id !== c.id);
  }

  findById(id: string) {
    return Promise.resolve(this.items.get(id) ?? null);
  }

  findByEmail(email: EmailAddress) {
    return Promise.resolve([...this.items.values()].find((c) => c.email === email.value) ?? null);
  }

  findByLegacyId(legacyId: string) {
    return Promise.resolve([...this.items.values()].find((c) => c.legacy?.id === legacyId) ?? null);
  }

  insert(c: Customer): Promise<'inserted' | 'email_taken'> {
    if (this.emailTaken(c)) return Promise.resolve('email_taken');
    this.items.set(c.id, c);
    return Promise.resolve('inserted');
  }

  update(c: Customer): Promise<'updated' | 'missing' | 'email_taken'> {
    if (!this.items.has(c.id)) return Promise.resolve('missing');
    if (this.emailTaken(c)) return Promise.resolve('email_taken');
    this.items.set(c.id, c);
    return Promise.resolve('updated');
  }
}

export class InMemoryCustomerTokenRepository implements CustomerTokenRepository {
  readonly items = new Map<string, CustomerToken>();

  insert(token: CustomerToken): Promise<void> {
    this.items.set(token.id, token);
    return Promise.resolve();
  }

  take(id: string, kind: CustomerTokenKind, now: Date): Promise<CustomerToken | null> {
    const token = this.items.get(id);
    if (!token || token.kind !== kind || token.expiresAt <= now) return Promise.resolve(null);
    this.items.delete(id);
    return Promise.resolve(token);
  }

  deleteFor(customerId: string, kind: CustomerTokenKind): Promise<void> {
    for (const [id, t] of this.items) {
      if (t.customerId === customerId && t.kind === kind) this.items.delete(id);
    }
    return Promise.resolve();
  }
}

/** Keeps what would have been emailed. */
export class RecordingMailer implements CustomerMailer {
  readonly sent: { kind: 'verify' | 'reset'; to: string; token: string }[] = [];

  sendEmailVerification(to: string, token: string): Promise<void> {
    this.sent.push({ kind: 'verify', to, token });
    return Promise.resolve();
  }

  sendPasswordReset(to: string, token: string): Promise<void> {
    this.sent.push({ kind: 'reset', to, token });
    return Promise.resolve();
  }

  last(kind: 'verify' | 'reset') {
    return this.sent.filter((m) => m.kind === kind).at(-1);
  }
}

export class RecordingSessions implements CustomerSessions, StaffSessions {
  readonly revoked: string[] = [];

  revokeAll(id: string): Promise<void> {
    this.revoked.push(id);
    return Promise.resolve();
  }
}

/** Not encryption: marks the value with the staff id, so a wrong id fails to open. */
export class FakeTwoFactorCipher implements TwoFactorSecretCipher {
  seal(staffId: string, secret: string): string {
    return `${staffId}|${secret}`;
  }

  open(staffId: string, sealed: string): string {
    const [owner, secret] = sealed.split('|');
    if (owner !== staffId) throw new Error('sealed for another staff member');
    return secret!;
  }
}

export class InMemoryStaffUserRepository implements StaffUserRepository {
  readonly items = new Map<string, StaffUser>();

  constructor(...staff: StaffUser[]) {
    for (const s of staff) this.items.set(s.id, s);
  }

  private emailTaken(s: StaffUser): boolean {
    return [...this.items.values()].some((o) => o.email === s.email && o.id !== s.id);
  }

  findById(id: string) {
    return Promise.resolve(this.items.get(id) ?? null);
  }

  findByEmail(email: EmailAddress) {
    return Promise.resolve([...this.items.values()].find((s) => s.email === email.value) ?? null);
  }

  list() {
    return Promise.resolve([...this.items.values()]);
  }

  countWithRole(roleId: string) {
    return Promise.resolve([...this.items.values()].filter((s) => s.roleId === roleId).length);
  }

  insert(s: StaffUser): Promise<'inserted' | 'email_taken'> {
    if (this.emailTaken(s)) return Promise.resolve('email_taken');
    this.items.set(s.id, s);
    return Promise.resolve('inserted');
  }

  update(s: StaffUser): Promise<'updated' | 'missing' | 'email_taken'> {
    if (!this.items.has(s.id)) return Promise.resolve('missing');
    if (this.emailTaken(s)) return Promise.resolve('email_taken');
    this.items.set(s.id, s);
    return Promise.resolve('updated');
  }
}

export class InMemoryRoleRepository implements RoleRepository {
  readonly items = new Map<string, Role>();

  constructor(...roles: Role[]) {
    for (const r of roles) this.items.set(r.id, r);
  }

  private nameTaken(r: Role): boolean {
    return [...this.items.values()].some(
      (o) => o.name.toLowerCase() === r.name.toLowerCase() && o.id !== r.id,
    );
  }

  findById(id: string) {
    return Promise.resolve(this.items.get(id) ?? null);
  }

  list() {
    return Promise.resolve([...this.items.values()]);
  }

  insert(r: Role): Promise<'inserted' | 'name_taken'> {
    if (this.nameTaken(r)) return Promise.resolve('name_taken');
    this.items.set(r.id, r);
    return Promise.resolve('inserted');
  }

  update(r: Role): Promise<'updated' | 'missing' | 'name_taken'> {
    if (!this.items.get(r.id) || this.items.get(r.id)!.system) return Promise.resolve('missing');
    if (this.nameTaken(r)) return Promise.resolve('name_taken');
    this.items.set(r.id, r);
    return Promise.resolve('updated');
  }

  delete(id: string) {
    const found = this.items.get(id);
    if (!found || found.system) return Promise.resolve(false);
    return Promise.resolve(this.items.delete(id));
  }

  removePermissions(keys: readonly string[], at: Date) {
    let changed = 0;
    for (const r of this.items.values()) {
      const kept = r.permissions.filter((k) => !keys.includes(k));
      if (kept.length !== r.permissions.length) {
        this.items.set(r.id, { ...r, permissions: kept, updatedAt: at });
        changed++;
      }
    }
    return Promise.resolve(changed);
  }
}

export class InMemoryPermissionRepository implements PermissionRepository {
  readonly items = new Map<string, Permission>();

  constructor(...permissions: Permission[]) {
    for (const p of permissions) this.items.set(p.key, p);
  }

  list() {
    return Promise.resolve([...this.items.values()]);
  }

  findByKey(key: string) {
    return Promise.resolve(this.items.get(key) ?? null);
  }

  upsertDeclared(declared: readonly DeclaredPermission[], at: Date): Promise<void> {
    for (const d of declared) {
      const found = this.items.get(d.key);
      this.items.set(
        d.key,
        found
          ? { ...found, active: true, syncedAt: at }
          : permission(d.key, { group: d.group, label: { en: d.label, ar: null }, syncedAt: at }),
      );
    }
    return Promise.resolve();
  }

  deactivateAllBut(keep: readonly string[], at: Date): Promise<string[]> {
    const gone: string[] = [];
    for (const p of this.items.values()) {
      if (p.active && !keep.includes(p.key)) {
        this.items.set(p.key, { ...p, active: false, syncedAt: at });
        gone.push(p.key);
      }
    }
    return Promise.resolve(gone);
  }

  edit(
    key: string,
    change: { label?: Permission['label']; description?: string | null; group?: string },
  ): Promise<boolean> {
    const found = this.items.get(key);
    if (!found) return Promise.resolve(false);
    const set = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
    this.items.set(key, { ...found, ...set });
    return Promise.resolve(true);
  }
}
