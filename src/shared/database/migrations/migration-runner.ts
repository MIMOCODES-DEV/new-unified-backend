import type { Db } from 'mongodb';
import type { Migration } from './migration.js';

const APPLIED_COLLECTION = '_migrations';

interface AppliedMigration {
  _id: string;
  description: string;
  appliedAt: Date;
}

/** Applies pending migrations in id order and records each one. Re-running is a no-op. */
export async function runMigrations(db: Db, migrations: readonly Migration[]): Promise<string[]> {
  const ids = migrations.map((m) => m.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Duplicate migration ids');
  }

  const applied = db.collection<AppliedMigration>(APPLIED_COLLECTION);
  const done = new Set(
    (await applied.find({}, { projection: { _id: 1 } }).toArray()).map((m) => m._id),
  );
  const pending = [...migrations]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((m) => !done.has(m.id));

  for (const migration of pending) {
    await migration.up(db);
    await applied.insertOne({
      _id: migration.id,
      description: migration.description,
      appliedAt: new Date(),
    });
  }
  return pending.map((m) => m.id);
}
