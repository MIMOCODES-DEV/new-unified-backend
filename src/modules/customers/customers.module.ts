import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { BcryptPasswordHasher } from '../../shared/crypto/bcrypt-password-hasher.js';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { PasswordHasher } from '../../shared/kernel/password-hasher.js';
import { CustomerLinks } from './application/customer-links.js';
import {
  CustomerDevices,
  CustomerMailer,
  CustomerSessions,
} from './application/ports/customer-outside.js';
import { CustomerTokenRepository } from './application/ports/customer-token.repository.js';
import { CustomerRepository } from './application/ports/customer.repository.js';
import {
  CustomerLoginUseCase,
  GetCustomerUseCase,
  RequestPasswordResetUseCase,
  ResendVerificationUseCase,
  ResetPasswordUseCase,
  SignUpCustomerUseCase,
  UpdateCustomerProfileUseCase,
  VerifyCustomerEmailUseCase,
} from './application/use-cases/customer-account.use-cases.js';
import {
  LinkAccountDeviceUseCase,
  ListAccountDevicesUseCase,
  UnlinkAccountDeviceUseCase,
} from './application/use-cases/customer-devices.use-cases.js';
import { MongoCustomerTokenRepository } from './infrastructure/mongo-customer-token.repository.js';
import { MongoCustomerRepository } from './infrastructure/mongo-customer.repository.js';
import { RedisCustomerSessions } from './infrastructure/redis-customer-sessions.js';

const useCases = [
  SignUpCustomerUseCase,
  VerifyCustomerEmailUseCase,
  ResendVerificationUseCase,
  CustomerLoginUseCase,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
  GetCustomerUseCase,
  UpdateCustomerProfileUseCase,
  LinkAccountDeviceUseCase,
  UnlinkAccountDeviceUseCase,
  ListAccountDevicesUseCase,
];

export interface CustomersModuleOptions {
  /** Modules the factories need. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** The brand's devices (bound by the process root: src/module-settings.ts). */
  devices: Omit<FactoryProvider<CustomerDevices>, 'provide'>;
  /** Sends the brand's emails. */
  mailer: Omit<FactoryProvider<CustomerMailer>, 'provide'>;
}

/**
 * Customers of each brand's website (ACC-1, CUS-1 to CUS-4): accounts, email links, linked
 * devices. Needs DatabaseModule, TenancyModule and RedisModule (sessions), all global.
 */
@Module({})
export class CustomersModule {
  static forRootAsync(options: CustomersModuleOptions): DynamicModule {
    return {
      module: CustomersModule,
      imports: options.imports,
      providers: [
        ...useCases,
        CustomerLinks,
        { provide: Clock, useClass: SystemClock },
        { provide: PasswordHasher, useClass: BcryptPasswordHasher },
        { provide: CustomerRepository, useClass: MongoCustomerRepository },
        { provide: CustomerTokenRepository, useClass: MongoCustomerTokenRepository },
        { provide: CustomerSessions, useClass: RedisCustomerSessions },
        { provide: CustomerDevices, ...options.devices },
        { provide: CustomerMailer, ...options.mailer },
      ],
      exports: useCases,
    };
  }
}
