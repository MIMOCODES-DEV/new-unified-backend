import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { CENTRAL_DB } from './database.tokens.js';
import { MongoClientPool } from './mongo-client.pool.js';
import { TenantDbRegistry } from './tenant-db.registry.js';

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
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(MongoClientPool) private readonly pool: MongoClientPool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.closeAll();
  }
}
