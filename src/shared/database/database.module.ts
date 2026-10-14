import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { CENTRAL_DB } from './database.tokens.js';
import { MongoClientPool } from './mongo-client.pool.js';
import { TenantDbRegistry } from './tenant-db.registry.js';

const IDLE_SWEEP_MS = 60_000;

@Global()
@Module({
  providers: [
    { provide: MongoClientPool, useFactory: () => new MongoClientPool() },
    {
      provide: CENTRAL_DB,
      inject: [MongoClientPool, AppConfig],
      useFactory: async (pool: MongoClientPool, config: AppConfig) =>
        (await pool.get(config.env.MONGO_URI)).db(config.env.MONGO_CENTRAL_DB),
    },
    TenantDbRegistry,
  ],
  exports: [CENTRAL_DB, TenantDbRegistry],
})
export class DatabaseModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private sweep?: NodeJS.Timeout;

  constructor(
    @Inject(MongoClientPool) private readonly pool: MongoClientPool,
    private readonly registry: TenantDbRegistry,
  ) {}

  onApplicationBootstrap(): void {
    // unref: the sweep never keeps a finished CLI command or a stopping process alive.
    this.sweep = setInterval(() => void this.registry.closeIdle(), IDLE_SWEEP_MS).unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.sweep);
    await this.pool.closeAll();
  }
}
