import type { Db, Document, IndexDescription } from 'mongodb';

/**
 * Creates a collection with a `$jsonSchema` validator and its indexes, or updates the validator
 * and adds missing indexes when it already exists. Safe to run again.
 * The validator is a safety net for hand-edited data; the zod schema next to each repository stays
 * the source of truth for the stored shape.
 */
export async function ensureCollection(
  db: Db,
  name: string,
  schema: Document,
  indexes: IndexDescription[],
): Promise<void> {
  const validation = {
    validator: { $jsonSchema: schema },
    validationLevel: 'strict',
    validationAction: 'error',
  } as const;
  const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
  if (exists) {
    await db.command({ collMod: name, ...validation });
  } else {
    await db.createCollection(name, validation);
  }
  if (indexes.length > 0) {
    await db.collection(name).createIndexes(indexes);
  }
}

type BsonSchema = Document & { bsonType: string | string[] };

/** Small builders for `$jsonSchema` validators, so each collection's validator reads like its fields. */
export const bson = {
  string: (): BsonSchema => ({ bsonType: 'string' }),
  enum: (values: readonly string[]): BsonSchema => ({ bsonType: 'string', enum: [...values] }),
  bool: (): BsonSchema => ({ bsonType: 'bool' }),
  /** int, long or double: the driver stores small whole numbers as int32. */
  number: (): BsonSchema => ({ bsonType: 'number' }),
  date: (): BsonSchema => ({ bsonType: 'date' }),
  array: (items: BsonSchema): BsonSchema => ({ bsonType: 'array', items }),
  /** An object whose listed properties are all required. */
  object: (properties: Record<string, BsonSchema>): BsonSchema => ({
    bsonType: 'object',
    required: Object.keys(properties),
    properties,
  }),
  /** Any object (the `legacy` bag of old fields). */
  anyObject: (): BsonSchema => ({ bsonType: 'object' }),
  nullable: (schema: BsonSchema): BsonSchema => ({
    ...schema,
    bsonType: [schema.bsonType, 'null'].flat(),
    ...(Array.isArray(schema['enum']) ? { enum: [...(schema['enum'] as unknown[]), null] } : {}),
  }),
};
