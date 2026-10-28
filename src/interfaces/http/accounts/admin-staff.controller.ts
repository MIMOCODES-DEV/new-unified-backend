import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateRoleUseCase,
  CreateStaffUseCase,
  DeleteRoleUseCase,
  EditPermissionUseCase,
  GetStaffUseCase,
  ListPermissionsUseCase,
  ListRolesUseCase,
  ListStaffUseCase,
  STAFF_STATUSES,
  UpdateRoleUseCase,
  UpdateStaffUseCase,
} from '../../../modules/staff/index.js';
import { CentralStaff } from '../../../shared/auth/access.decorators.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { BAD_REQUEST, CONFLICT, FORBIDDEN, NOT_FOUND, parse, unwrap } from './http-results.js';
import { staffView } from './admin-auth.controller.js';

const STATUSES = {
  'staff.invalid_input': BAD_REQUEST,
  'staff.not_found': NOT_FOUND,
  'staff.email_taken': CONFLICT,
  'staff.cannot_change_self': FORBIDDEN,
  'staff.role_not_found': NOT_FOUND,
  'staff.role_name_taken': CONFLICT,
  'staff.system_role': FORBIDDEN,
  'staff.role_in_use': CONFLICT,
  'staff.unknown_permission': BAD_REQUEST,
  'staff.permission_not_found': NOT_FOUND,
};

const tenantAccess = z.array(z.string().max(64)).max(200);
const permissionKeys = z.array(z.string().max(100)).max(500);

/** Staff management (STF-2), roles (PRM-2) and permission labels (PRM-1), for the super admin. */
@Controller('admin')
export class AdminStaffController {
  constructor(
    private readonly listStaff: ListStaffUseCase,
    private readonly getStaff: GetStaffUseCase,
    private readonly createStaff: CreateStaffUseCase,
    private readonly updateStaff: UpdateStaffUseCase,
    private readonly listRoles: ListRolesUseCase,
    private readonly createRole: CreateRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
    private readonly listPermissions: ListPermissionsUseCase,
    private readonly editPermission: EditPermissionUseCase,
    private readonly auth: AuthContext,
  ) {}

  @CentralStaff('staff.manage')
  @Get('staff')
  async staffList() {
    return { staff: (await this.listStaff.execute()).map(staffView) };
  }

  @CentralStaff('staff.manage')
  @Get('staff/:id')
  async staffOne(@Param('id') id: string) {
    return { staff: staffView(unwrap(await this.getStaff.execute(id), STATUSES)) };
  }

  @CentralStaff('staff.manage')
  @Post('staff')
  async staffCreate(@Body() body: unknown) {
    const input = parse(
      z.object({
        email: z.string().max(300),
        name: z.string().max(100),
        password: z.string().max(1000),
        roleId: z.string().max(100),
        tenantAccess,
      }),
      body,
    );
    return { staff: staffView(unwrap(await this.createStaff.execute(input), STATUSES)) };
  }

  /** Disabling, a new password or a 2FA reset logs the member out everywhere at once. */
  @CentralStaff('staff.manage')
  @Patch('staff/:id')
  async staffUpdate(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        name: z.string().max(100).optional(),
        email: z.string().max(300).optional(),
        roleId: z.string().max(100).optional(),
        tenantAccess: tenantAccess.optional(),
        status: z.enum(STAFF_STATUSES).optional(),
        password: z.string().max(1000).optional(),
        resetTwoFactor: z.boolean().optional(),
      }),
      body,
    );
    const actorId = this.auth.staff().staffId;
    const staff = unwrap(await this.updateStaff.execute({ actorId, id, ...input }), STATUSES);
    return { staff: staffView(staff) };
  }

  @CentralStaff('roles.manage')
  @Get('roles')
  async roles() {
    return { roles: await this.listRoles.execute() };
  }

  @CentralStaff('roles.manage')
  @Post('roles')
  async roleCreate(@Body() body: unknown) {
    const input = parse(z.object({ name: z.string().max(100), permissions: permissionKeys }), body);
    const createdBy = this.auth.staff().staffId;
    return { role: unwrap(await this.createRole.execute({ ...input, createdBy }), STATUSES) };
  }

  @CentralStaff('roles.manage')
  @Patch('roles/:id')
  async roleUpdate(@Param('id') id: string, @Body() body: unknown) {
    const input = parse(
      z.object({ name: z.string().max(100).optional(), permissions: permissionKeys.optional() }),
      body,
    );
    return { role: unwrap(await this.updateRole.execute({ id, ...input }), STATUSES) };
  }

  @CentralStaff('roles.manage')
  @Delete('roles/:id')
  async roleDelete(@Param('id') id: string) {
    return unwrap(await this.deleteRole.execute(id), STATUSES);
  }

  @CentralStaff('roles.manage')
  @Get('permissions')
  async permissions() {
    return { permissions: await this.listPermissions.execute() };
  }

  /** How a key is shown in the panel; the keys themselves come from the code. */
  @CentralStaff('roles.manage')
  @Patch('permissions/:key')
  async permissionEdit(@Param('key') key: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        label: z.object({ en: z.string().max(100), ar: z.string().max(100).nullable() }).optional(),
        description: z.string().max(500).nullable().optional(),
        group: z.string().max(50).optional(),
      }),
      body,
    );
    return { permission: unwrap(await this.editPermission.execute({ key, ...input }), STATUSES) };
  }
}
