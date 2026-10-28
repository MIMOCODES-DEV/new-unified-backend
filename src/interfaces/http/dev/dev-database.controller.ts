import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Db, Document } from 'mongodb';
import { Public } from '../../../shared/auth/access.decorators.js';
import { CENTRAL_DB } from '../../../shared/database/database.tokens.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { DevOnlyGuard } from './dev-only.guard.js';

/** The device core collections of a brand database, in the order the playground shows them. */
const BRAND_COLLECTIONS = ['trialDevices', 'devices', 'licenses', 'playlists', 'captchas'] as const;

/** The field each collection sets when a row changes after it was created. */
const CHANGED_AT: Record<string, string> = {
  trialDevices: 'updatedAt',
  devices: 'updatedAt',
  licenses: 'revokedAt',
  playlists: 'updatedAt',
  captchas: 'verifiedAt',
  domainMigrations: 'updatedAt',
};

interface FieldSchema {
  name: string;
  type: string;
  required: boolean;
  /** The allowed values, when the validator lists them. */
  values?: unknown[];
  /** The keys of an object field. */
  keys?: string[];
  /** The value in one stored row (an `example-` seed row when there is one); secrets hidden. */
  example?: string;
}

/** Fields whose values stay hidden even in the dev schema view. */
const HIDDEN_VALUE = /hash|secret|password|pinenc|token|ciphertext|wrapped/i;

/** The value with secret-looking keys hidden at any depth. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        HIDDEN_VALUE.test(k) && v !== null ? '(hidden)' : redact(v),
      ]),
    );
  }
  return value;
}

function exampleOf(name: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (HIDDEN_VALUE.test(name)) return value === null ? 'null' : '(hidden)';
  const text = value instanceof Date ? value.toISOString() : JSON.stringify(redact(value));
  return text.length > 80 ? text.slice(0, 77) + '…' : text;
}

interface CollectionSchema {
  name: string;
  /** `validator`: from the migration's $jsonSchema; `sample`: read from one stored row. */
  source: 'validator' | 'sample' | 'none';
  fields: FieldSchema[];
  indexes: {
    name: string;
    keys: Record<string, unknown>;
    unique: boolean;
    partial: boolean;
    ttlSeconds?: number;
  }[];
  rows: number;
}

interface DatabaseSchema {
  database: string;
  collections: CollectionSchema[];
}

interface CollectionCount {
  name: string;
  rows: number;
  /** Rows written by `seed:examples` (`example-` ids); the rest come from the playground and tests. */
  examples: number;
  /** With `since`: rows created since then, and older rows changed since then. */
  created?: number;
  changed?: number;
}

/**
 * Dev-only, read-only views of the database for the playground: how many rows each collection
 * holds, and every document stored for one MAC, exactly as saved. 404 in production.
 */
@Controller('dev/db')
@UseGuards(DevOnlyGuard)
export class DevDatabaseController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly context: TenantContext,
    @Inject(CENTRAL_DB) private readonly central: Db,
  ) {}

  @Public()
  @Get('summary')
  async summary(@Query('since') sinceRaw?: string): Promise<{
    now: string;
    brand: string;
    database: string;
    collections: CollectionCount[];
    central: {
      database: string;
      collections: (CollectionCount & { byStatus: Record<string, number> })[];
    };
  }> {
    const now = new Date();
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    if (since && Number.isNaN(since.getTime()))
      throw new BadRequestException('since is not a date');
    const db = await this.tenantDb.db();
    const collections = await Promise.all(
      BRAND_COLLECTIONS.map(async (name) => count(db.collection(name), name, since)),
    );
    const moves = this.central.collection('domainMigrations');
    const byStatus = await moves
      .aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }])
      .toArray();
    return {
      now: now.toISOString(),
      brand: this.context.current.slug,
      database: db.databaseName,
      collections,
      central: {
        database: this.central.databaseName,
        collections: [
          {
            ...(await count(moves, 'domainMigrations', since)),
            byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
          },
        ],
      },
    };
  }

  /**
   * The schema as MongoDB holds it: for each collection of the brand database and of the central one,
   * its fields from the validator the migrations set (or from one stored row when it has none), and
   * its indexes.
   */
  @Public()
  @Get('schema')
  async schema(): Promise<{ brand: DatabaseSchema; central: DatabaseSchema }> {
    return {
      brand: await describe(await this.tenantDb.db()),
      central: await describe(this.central),
    };
  }

  /** Every row of the brand database that belongs to this MAC, as stored. */
  @Public()
  @Get('mac/:mac')
  async byMac(
    @Param('mac') raw: string,
  ): Promise<Record<(typeof BRAND_COLLECTIONS)[number], Document[]>> {
    const mac = MacAddress.parse(raw);
    if (!mac.ok) throw new BadRequestException('Not a MAC address');
    const db = await this.tenantDb.db();
    const find = (name: string, filter: Document) =>
      db.collection(name).find(filter).sort({ createdAt: 1 }).limit(50).toArray();
    const [trialDevices, devices, captchas] = await Promise.all([
      find('trialDevices', { macAddress: mac.value.value }),
      find('devices', { macAddress: mac.value.value }),
      find('captchas', { macAddress: mac.value.value }),
    ]);
    const ids = [...trialDevices, ...devices].map((d) => d._id);
    const [licenses, playlists] = await Promise.all([
      find('licenses', { deviceId: { $in: ids } }),
      find('playlists', { deviceId: { $in: ids } }),
    ]);
    return { trialDevices, devices, licenses, playlists, captchas };
  }
}

async function count(
  collection: ReturnType<Db['collection']>,
  name: string,
  since?: Date,
): Promise<CollectionCount> {
  const [rows, examples] = await Promise.all([
    collection.countDocuments({}),
    collection.countDocuments({ _id: { $regex: '^example-' } } as Document),
  ]);
  if (!since) return { name, rows, examples };
  const [created, changed] = await Promise.all([
    collection.countDocuments({ createdAt: { $gte: since } }),
    collection.countDocuments({
      [CHANGED_AT[name] ?? 'updatedAt']: { $gte: since },
      createdAt: { $lt: since },
    }),
  ]);
  return { name, rows, examples, created, changed };
}

/** The type of a $jsonSchema property, as one word ("string", "date or null"…). */
function typeOf(property: Document | undefined): string {
  if (!property) return 'any';
  const t: unknown = property.bsonType ?? property.type ?? (property.enum ? 'enum' : 'any');
  return (Array.isArray(t) ? t : [t]).map(String).join(' or ');
}

function sampleType(value: unknown): string {
  if (value === null) return 'null';
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

async function describe(db: Db): Promise<DatabaseSchema> {
  const infos = await db.listCollections({ type: 'collection' }).toArray();
  const collections: CollectionSchema[] = [];
  for (const info of infos.sort((a, b) => a.name.localeCompare(b.name))) {
    const collection = db.collection(info.name);
    const options = (info as { options?: Document }).options ?? {};
    const json = (options.validator as Document | undefined)?.$jsonSchema as Document | undefined;
    let fields: FieldSchema[] = [];
    let source: CollectionSchema['source'] = 'none';
    const row =
      (await collection.findOne({ _id: { $regex: '^example-' } } as Document)) ??
      (await collection.findOne({}));
    if (json?.properties) {
      source = 'validator';
      const required = new Set<string>((json.required as string[] | undefined) ?? []);
      fields = Object.entries(json.properties as Record<string, Document>).map(([name, p]) => ({
        name,
        type: typeOf(p),
        required: required.has(name),
        ...(p.enum ? { values: p.enum as unknown[] } : {}),
        ...(p.properties ? { keys: Object.keys(p.properties as Document) } : {}),
        ...(row && exampleOf(name, row[name]) !== undefined
          ? { example: exampleOf(name, row[name]) }
          : {}),
      }));
    } else {
      if (row) {
        source = 'sample';
        fields = Object.entries(row).map(([name, value]) => ({
          name,
          type: sampleType(value),
          required: false,
          example: exampleOf(name, value),
          ...(value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          !(value instanceof Date)
            ? { keys: Object.keys(value as Document) }
            : {}),
        }));
      }
    }
    const indexes = (await collection.indexes()).map((ix) => ({
      name: String(ix.name),
      keys: ix.key,
      unique: !!ix.unique,
      partial: !!ix.partialFilterExpression,
      ...(ix.expireAfterSeconds !== undefined ? { ttlSeconds: ix.expireAfterSeconds } : {}),
    }));
    collections.push({
      name: info.name,
      source,
      fields,
      indexes,
      rows: await collection.estimatedDocumentCount(),
    });
  }
  return { database: db.databaseName, collections };
}
