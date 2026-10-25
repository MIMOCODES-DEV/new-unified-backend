import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Migration } from '../../src/shared/database/migrations/migration.js';
import { runMigrations } from '../../src/shared/database/migrations/migration-runner.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

describe('runMigrations', () => {
  let infra: TestInfrastructure;
  let client: MongoClient;

  beforeAll(async () => {
    infra = await startInfrastructure();
    client = await MongoClient.connect(infra.mongoUri);
  });

  afterAll(async () => {
    await client?.close();
    await infra?.stop();
  });

  it('applies pending migrations in order and is a no-op when re-run', async () => {
    const db = client.db('migrations_test');
    const calls: string[] = [];
    const migration = (id: string): Migration => ({
      id,
      description: id,
      up: async () => {
        calls.push(id);
        await db.collection('things').createIndex({ [id]: 1 });
      },
    });
    const migrations = [migration('0002-second'), migration('0001-first')];

    expect(await runMigrations(db, migrations)).toEqual(['0001-first', '0002-second']);
    expect(await runMigrations(db, migrations)).toEqual([]);
    expect(calls).toEqual(['0001-first', '0002-second']);
  });
});
