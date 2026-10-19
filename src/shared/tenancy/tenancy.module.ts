import { Global, Module } from '@nestjs/common';
import { TenantContext } from './tenant-context.js';
import { TenantDb } from './tenant-db.js';

/** Brand context and brand database, available to every module. Needs ClsModule and DatabaseModule. */
@Global()
@Module({
  providers: [TenantContext, TenantDb],
  exports: [TenantContext, TenantDb],
})
export class TenancyModule {}
