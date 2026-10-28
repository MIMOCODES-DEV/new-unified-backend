import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  type Customer as CustomerAccount,
  type CustomerDevice,
  CustomerLoginUseCase,
  GetCustomerUseCase,
  LinkAccountDeviceUseCase,
  ListAccountDevicesUseCase,
  RequestPasswordResetUseCase,
  ResendVerificationUseCase,
  ResetPasswordUseCase,
  SignUpCustomerUseCase,
  UnlinkAccountDeviceUseCase,
  UpdateCustomerProfileUseCase,
  VerifyCustomerEmailUseCase,
} from '../../../modules/customers/index.js';
import { Customer, Public } from '../../../shared/auth/access.decorators.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { SessionStore } from '../../../shared/auth/session-store.js';
import { RedisRateLimiter } from '../../../shared/redis/redis-rate-limiter.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  limit,
  NOT_FOUND,
  parse,
  UNAUTHORIZED,
  unwrap,
} from './http-results.js';

/** How long a customer stays logged in on the brand site. */
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MINUTES = 60 * 1000;
/** Logins and reset requests: per IP and per email. */
const LOGIN_LIMIT = { limit: 10, windowMs: 15 * MINUTES };
const SIGN_UP_LIMIT = { limit: 10, windowMs: 60 * MINUTES };
/** A device key is 6 digits: tries are counted per account and per IP. */
const LINK_LIMIT = { limit: 10, windowMs: 60 * MINUTES };

const STATUSES = {
  'customers.invalid_input': BAD_REQUEST,
  'customers.email_taken': CONFLICT,
  'customers.invalid_credentials': UNAUTHORIZED,
  'customers.email_not_verified': FORBIDDEN,
  'customers.invalid_link': BAD_REQUEST,
  'customers.not_found': NOT_FOUND,
  'customers.device_key_mismatch': NOT_FOUND,
  'customers.device_not_found': NOT_FOUND,
  'customers.device_linked_elsewhere': CONFLICT,
};

const password = z.string().max(1000);
const name = z.string().max(100).nullable().optional();

const customerView = (c: CustomerAccount) => ({
  id: c.id,
  email: c.email,
  firstName: c.firstName,
  lastName: c.lastName,
  emailVerified: c.emailVerifiedAt !== null,
  emailVerifiedAt: c.emailVerifiedAt,
  createdAt: c.createdAt,
});

const deviceView = (d: CustomerDevice) => ({
  id: d.id,
  macAddress: d.macAddress,
  platform: d.platform,
  lastSeenAt: d.lastSeenAt,
});

/** The brand site's customer API (CUS-1 to CUS-4). The brand comes from the host. */
@Controller('customer')
export class CustomerController {
  constructor(
    private readonly signUpCustomer: SignUpCustomerUseCase,
    private readonly verifyEmail: VerifyCustomerEmailUseCase,
    private readonly resend: ResendVerificationUseCase,
    private readonly loginCustomer: CustomerLoginUseCase,
    private readonly requestReset: RequestPasswordResetUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    private readonly getCustomer: GetCustomerUseCase,
    private readonly updateProfile: UpdateCustomerProfileUseCase,
    private readonly linkDevice: LinkAccountDeviceUseCase,
    private readonly unlinkDevice: UnlinkAccountDeviceUseCase,
    private readonly listDevices: ListAccountDevicesUseCase,
    private readonly sessions: SessionStore,
    private readonly limiter: RedisRateLimiter,
    private readonly auth: AuthContext,
    private readonly tenant: TenantContext,
  ) {}

  private key(kind: string, value: string): string {
    return `customers:${kind}:${this.tenant.current.id}:${value.toLowerCase()}`;
  }

  /** CUS-1: a verification link is emailed; the account cannot log in until it is opened. */
  @Public()
  @Post('sign-up')
  async signUp(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(
      z.object({ email: z.string().max(300), password, firstName: name, lastName: name }),
      body,
    );
    await limit(this.limiter, SIGN_UP_LIMIT, this.key('sign-up-ip', ip));
    const customer = unwrap(await this.signUpCustomer.execute(input), STATUSES);
    return { customer: customerView(customer) };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verify(@Body() body: unknown) {
    const { token } = parse(z.object({ token: z.string().max(200) }), body);
    return { customer: customerView(unwrap(await this.verifyEmail.execute(token), STATUSES)) };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(z.object({ email: z.string().max(300), password }), body);
    await limit(
      this.limiter,
      LOGIN_LIMIT,
      this.key('login-ip', ip),
      this.key('login-email', input.email.trim()),
    );
    const customer = unwrap(await this.loginCustomer.execute(input), STATUSES);
    const token = await this.sessions.create(
      { kind: 'customer', id: customer.id, tenantId: this.tenant.current.id },
      SESSION_MS,
    );
    return { token, customer: customerView(customer) };
  }

  @Customer()
  @Post('logout')
  @HttpCode(200)
  async logout() {
    await this.sessions.revoke(this.auth.customer().token);
    return { loggedOut: true };
  }

  /** Always the same answer, whether or not the email has an account. */
  @Public()
  @Post('password-reset')
  @HttpCode(202)
  async passwordReset(@Body() body: unknown, @Ip() ip: string) {
    const { email } = parse(z.object({ email: z.string().max(300) }), body);
    await limit(
      this.limiter,
      LOGIN_LIMIT,
      this.key('reset-ip', ip),
      this.key('reset-email', email.trim()),
    );
    await this.requestReset.execute(email);
    return { sent: true };
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(200)
  async passwordResetConfirm(@Body() body: unknown) {
    const input = parse(z.object({ token: z.string().max(200), password }), body);
    return unwrap(await this.resetPassword.execute(input), STATUSES);
  }

  @Customer()
  @Get('me')
  async me() {
    const { customerId } = this.auth.customer();
    return { customer: customerView(unwrap(await this.getCustomer.execute(customerId), STATUSES)) };
  }

  /** CUS-4: a new email or password needs the current password. */
  @Customer()
  @Patch('me')
  async updateMe(@Body() body: unknown) {
    const input = parse(
      z.object({
        firstName: name,
        lastName: name,
        email: z.string().max(300).optional(),
        newPassword: password.optional(),
        currentPassword: password.optional(),
      }),
      body,
    );
    const { customerId } = this.auth.customer();
    const customer = unwrap(await this.updateProfile.execute({ customerId, ...input }), STATUSES);
    return { customer: customerView(customer) };
  }

  @Customer()
  @Post('me/resend-verification')
  @HttpCode(200)
  async resendVerification() {
    const { customerId } = this.auth.customer();
    await limit(this.limiter, LOGIN_LIMIT, this.key('resend', customerId));
    return unwrap(await this.resend.execute(customerId), STATUSES);
  }

  @Customer()
  @Get('devices')
  async devices() {
    const { customerId } = this.auth.customer();
    return { devices: (await this.listDevices.execute(customerId)).map(deviceView) };
  }

  /** CUS-3: the MAC and device key shown on the TV. */
  @Customer()
  @Post('devices/link')
  @HttpCode(200)
  async link(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(z.object({ mac: z.string().max(64), deviceKey: z.string().max(32) }), body);
    const { customerId } = this.auth.customer();
    await limit(
      this.limiter,
      LINK_LIMIT,
      this.key('link-account', customerId),
      this.key('link-ip', ip),
    );
    const device = unwrap(
      await this.linkDevice.execute({ customerId, mac: input.mac, deviceKey: input.deviceKey }),
      STATUSES,
    );
    return { device: deviceView(device) };
  }

  @Customer()
  @Delete('devices/:id')
  async unlink(@Param('id') deviceId: string) {
    const { customerId } = this.auth.customer();
    return unwrap(await this.unlinkDevice.execute({ customerId, deviceId }), STATUSES);
  }
}
