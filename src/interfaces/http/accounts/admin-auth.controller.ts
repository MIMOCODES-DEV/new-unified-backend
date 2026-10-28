import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  GetStaffUseCase,
  ListRolesUseCase,
  SetUpTwoFactorUseCase,
  StaffLoginUseCase,
  StaffTwoFactorLoginUseCase,
  type StaffUser,
  ToggleTwoFactorUseCase,
} from '../../../modules/staff/index.js';
import { CentralStaff, Public } from '../../../shared/auth/access.decorators.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { SessionStore } from '../../../shared/auth/session-store.js';
import { RedisRateLimiter } from '../../../shared/redis/redis-rate-limiter.js';
import {
  BAD_REQUEST,
  fail,
  FORBIDDEN,
  limit,
  NOT_FOUND,
  parse,
  UNAUTHORIZED,
  unwrap,
} from './http-results.js';

/** How long a staff member stays logged in. */
const SESSION_MS = 12 * 60 * 60 * 1000;
/** Between the password and the 2FA code. */
const CHALLENGE_MS = 5 * 60 * 1000;
const LOGIN_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

const STATUSES = {
  'staff.invalid_credentials': UNAUTHORIZED,
  'staff.disabled': FORBIDDEN,
  'staff.invalid_two_factor_code': UNAUTHORIZED,
  'staff.two_factor_state': BAD_REQUEST,
  'staff.not_found': NOT_FOUND,
};

/** A staff member as the panel sees them: never the password hash or the 2FA secret. */
export const staffView = (s: StaffUser) => ({
  id: s.id,
  email: s.email,
  name: s.name,
  roleId: s.roleId,
  tenantAccess: s.tenantAccess,
  status: s.status,
  twoFactorEnabled: s.twoFactor?.enabledAt != null,
  lastLoginAt: s.lastLoginAt,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const code = z.object({ code: z.string().max(10) });

/** Staff login (STF-1) with optional two-factor codes, central for every brand. */
@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly loginStaff: StaffLoginUseCase,
    private readonly twoFactorLogin: StaffTwoFactorLoginUseCase,
    private readonly setUpTwoFactor: SetUpTwoFactorUseCase,
    private readonly toggleTwoFactor: ToggleTwoFactorUseCase,
    private readonly getStaff: GetStaffUseCase,
    private readonly listRoles: ListRolesUseCase,
    private readonly sessions: SessionStore,
    private readonly limiter: RedisRateLimiter,
    private readonly auth: AuthContext,
  ) {}

  /** With 2FA on, answers a challenge to send back with the code to `login/two-factor`. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(
      z.object({ email: z.string().max(300), password: z.string().max(1000) }),
      body,
    );
    await limit(
      this.limiter,
      LOGIN_LIMIT,
      `staff:login-ip:${ip}`,
      `staff:login-email:${input.email.trim().toLowerCase()}`,
    );
    const { staff, twoFactorRequired } = unwrap(await this.loginStaff.execute(input), STATUSES);
    if (twoFactorRequired) {
      const challenge = await this.sessions.create(
        { kind: 'staff-2fa', id: staff.id, tenantId: null },
        CHALLENGE_MS,
      );
      return { twoFactorRequired: true, challenge };
    }
    return this.startSession(staff);
  }

  @Public()
  @Post('login/two-factor')
  @HttpCode(200)
  async loginTwoFactor(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(
      z.object({ challenge: z.string().max(200), code: z.string().max(10) }),
      body,
    );
    const session = await this.sessions.find(input.challenge);
    if (session?.kind !== 'staff-2fa') {
      throw fail(UNAUTHORIZED, 'staff.invalid_credentials', 'Log in again');
    }
    // Six digits: tries are counted per account, not only per IP.
    await limit(this.limiter, LOGIN_LIMIT, `staff:2fa-ip:${ip}`, `staff:2fa:${session.id}`);
    const staff = unwrap(
      await this.twoFactorLogin.execute({ staffId: session.id, code: input.code }),
      STATUSES,
    );
    await this.sessions.revoke(input.challenge);
    return this.startSession(staff);
  }

  @CentralStaff()
  @Post('logout')
  @HttpCode(200)
  async logout() {
    await this.sessions.revoke(this.auth.staff().token);
    return { loggedOut: true };
  }

  /** The caller, with the role (and its keys) the panel builds its menus from. */
  @CentralStaff()
  @Get('me')
  async me() {
    const staff = unwrap(await this.getStaff.execute(this.auth.staff().staffId), STATUSES);
    const role = (await this.listRoles.execute()).find((r) => r.id === staff.roleId) ?? null;
    return { staff: staffView(staff), role };
  }

  /** A new 2FA secret for the caller's authenticator app; on only after `enable` with a code. */
  @CentralStaff()
  @Post('me/two-factor/setup')
  @HttpCode(200)
  async twoFactorSetup() {
    return unwrap(await this.setUpTwoFactor.execute(this.auth.staff().staffId), STATUSES);
  }

  @CentralStaff()
  @Post('me/two-factor/enable')
  @HttpCode(200)
  async twoFactorEnable(@Body() body: unknown) {
    const input = parse(code, body);
    const staffId = this.auth.staff().staffId;
    return unwrap(await this.toggleTwoFactor.execute({ staffId, on: true, ...input }), STATUSES);
  }

  @CentralStaff()
  @Post('me/two-factor/disable')
  @HttpCode(200)
  async twoFactorDisable(@Body() body: unknown) {
    const input = parse(code, body);
    const staffId = this.auth.staff().staffId;
    return unwrap(await this.toggleTwoFactor.execute({ staffId, on: false, ...input }), STATUSES);
  }

  private async startSession(staff: StaffUser) {
    const token = await this.sessions.create(
      { kind: 'staff', id: staff.id, tenantId: null },
      SESSION_MS,
    );
    return { token, staff: staffView(staff) };
  }
}
