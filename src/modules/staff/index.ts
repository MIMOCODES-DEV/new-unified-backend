// Public API of the staff module: the only file other modules and interfaces may import.
export { StaffModule } from './staff.module.js';
export { staffMigrations } from './infrastructure/staff.migrations.js';
export { ALL_BRANDS, SUPER_ADMIN_ROLE_ID, STAFF_STATUSES, type StaffUser } from './domain/staff.js';
export type { DeclaredPermission } from './application/ports/staff.repositories.js';
export { AuthorizeStaffUseCase } from './application/use-cases/authorize-staff.use-case.js';
export {
  StaffLoginUseCase,
  StaffTwoFactorLoginUseCase,
  SetUpTwoFactorUseCase,
  ToggleTwoFactorUseCase,
} from './application/use-cases/staff-login.use-cases.js';
export {
  CreateStaffUseCase,
  GetStaffUseCase,
  ListStaffUseCase,
  UpdateStaffUseCase,
} from './application/use-cases/staff-management.use-cases.js';
export {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  ListRolesUseCase,
  UpdateRoleUseCase,
} from './application/use-cases/roles.use-cases.js';
export {
  EditPermissionUseCase,
  ListPermissionsUseCase,
  SyncPermissionsUseCase,
} from './application/use-cases/permissions.use-cases.js';
