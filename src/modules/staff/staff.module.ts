import { Module } from '@nestjs/common';
import { BcryptPasswordHasher } from '../../shared/crypto/bcrypt-password-hasher.js';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { PasswordHasher } from '../../shared/kernel/password-hasher.js';
import { StaffSessions, TwoFactorSecretCipher } from './application/ports/staff-security.js';
import {
  PermissionRepository,
  RoleRepository,
  StaffUserRepository,
} from './application/ports/staff.repositories.js';
import { AuthorizeStaffUseCase } from './application/use-cases/authorize-staff.use-case.js';
import {
  EditPermissionUseCase,
  ListPermissionsUseCase,
  SyncPermissionsUseCase,
} from './application/use-cases/permissions.use-cases.js';
import {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  ListRolesUseCase,
  UpdateRoleUseCase,
} from './application/use-cases/roles.use-cases.js';
import {
  SetUpTwoFactorUseCase,
  StaffLoginUseCase,
  StaffTwoFactorLoginUseCase,
  ToggleTwoFactorUseCase,
} from './application/use-cases/staff-login.use-cases.js';
import {
  CreateStaffUseCase,
  GetStaffUseCase,
  ListStaffUseCase,
  UpdateStaffUseCase,
} from './application/use-cases/staff-management.use-cases.js';
import {
  MongoPermissionRepository,
  MongoRoleRepository,
  MongoStaffUserRepository,
} from './infrastructure/mongo-staff.repositories.js';
import {
  EnvelopeTwoFactorCipher,
  RedisStaffSessions,
} from './infrastructure/staff-security.adapters.js';

const useCases = [
  StaffLoginUseCase,
  StaffTwoFactorLoginUseCase,
  SetUpTwoFactorUseCase,
  ToggleTwoFactorUseCase,
  AuthorizeStaffUseCase,
  CreateStaffUseCase,
  UpdateStaffUseCase,
  ListStaffUseCase,
  GetStaffUseCase,
  ListRolesUseCase,
  CreateRoleUseCase,
  UpdateRoleUseCase,
  DeleteRoleUseCase,
  SyncPermissionsUseCase,
  ListPermissionsUseCase,
  EditPermissionUseCase,
];

/**
 * Staff, roles and permissions, central for every brand (ACC-1, PRM, STF). Needs DatabaseModule,
 * RedisModule (sessions) and ConfigModule (2FA secret key), all global.
 */
@Module({
  providers: [
    ...useCases,
    { provide: Clock, useClass: SystemClock },
    { provide: PasswordHasher, useClass: BcryptPasswordHasher },
    { provide: StaffUserRepository, useClass: MongoStaffUserRepository },
    { provide: RoleRepository, useClass: MongoRoleRepository },
    { provide: PermissionRepository, useClass: MongoPermissionRepository },
    { provide: StaffSessions, useClass: RedisStaffSessions },
    { provide: TwoFactorSecretCipher, useClass: EnvelopeTwoFactorCipher },
  ],
  exports: useCases,
})
export class StaffModule {}
