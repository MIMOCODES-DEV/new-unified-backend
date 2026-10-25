import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { TenantsModule } from '../../../modules/tenants/index.js';
import { TenantController } from './tenant.controller.js';
import { TenantMiddleware } from './tenant.middleware.js';

@Module({
  imports: [TenantsModule],
  controllers: [TenantController],
  providers: [TenantMiddleware],
})
export class TenantHttpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      // Load balancers call health checks by IP, without a brand host.
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
      )
      .forRoutes('{*path}');
  }
}
