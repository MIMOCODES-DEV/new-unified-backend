import { describe, expect, it } from 'vitest';
import type { DomainMigration } from '../domain/domain-migration.js';
import { toDomainMigration, toDomainMigrationDocument } from './domain-migration.document.js';

const at = new Date('2026-10-25T10:00:00Z');

function move(overrides: Partial<DomainMigration>): DomainMigration {
  return {
    id: 'move-1',
    kind: 'migration',
    fromHost: 'old-provider.example:8080',
    toHost: 'new-provider.example:8080',
    fromScheme: 'http',
    toScheme: 'http',
    confirmations: [{ tenantId: 'tenant-cr', deviceId: 'device-1', ipHash: 'a1b2', at }],
    source: 'user',
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    firstSeenAt: at,
    lastConfirmedAt: at,
    legacy: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

describe('domain migration documents', () => {
  it('stores a move and reads it back unchanged', () => {
    const m = move({});

    expect(toDomainMigration(toDomainMigrationDocument(m))).toEqual(m);
  });

  it.each([
    ['an upper-case host', { fromHost: 'Old-Provider.example' }],
    ['a host with a scheme', { toHost: 'http://new-provider.example' }],
    ['the old status name', { status: 'active' }],
  ])('refuses %s', (_case, overrides) => {
    expect(() => toDomainMigrationDocument(move(overrides as Partial<DomainMigration>))).toThrow();
  });
});
