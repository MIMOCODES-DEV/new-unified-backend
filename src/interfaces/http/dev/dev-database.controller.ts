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
