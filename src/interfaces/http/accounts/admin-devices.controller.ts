import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { FindDeviceUseCase } from '../../../modules/devices/index.js';
import { ActivateLicenseUseCase, LICENSE_TYPES } from '../../../modules/licensing/index.js';
import { Staff } from '../../../shared/auth/access.decorators.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { BAD_REQUEST, CONFLICT, NOT_FOUND, parse, unwrap } from './http-results.js';

const STATUSES = {
  'kernel.invalid_mac_address': BAD_REQUEST,
  'devices.not_found': NOT_FOUND,
  'licensing.device_not_found': NOT_FOUND,
  'licensing.already_lifetime': CONFLICT,
  'licensing.device_conflict': CONFLICT,
};

/**
 * The first admin device routes, on the brand being served (the host): enough to prove the staff
 * access rules (E2E-A3). The full admin device API comes with the admin panel phase.
 */
@Controller('admin/devices')
export class AdminDevicesController {
  constructor(
    private readonly findDevice: FindDeviceUseCase,
    private readonly activate: ActivateLicenseUseCase,
    private readonly auth: AuthContext,
  ) {}

  @Staff('devices.view')
  @Get(':mac')
  async device(@Param('mac') value: string) {
    const mac = unwrap(MacAddress.parse(value), STATUSES);
    return unwrap(await this.findDevice.execute(mac), STATUSES);
  }

  /** LIC-2 by a staff member: recorded with source `admin` and the member's id. */
  @Staff('devices.activate')
  @Post(':mac/activate')
  @HttpCode(200)
  async activateDevice(@Param('mac') value: string, @Body() body: unknown) {
    const { type } = parse(z.object({ type: z.enum(LICENSE_TYPES) }), body);
    const mac = unwrap(MacAddress.parse(value), STATUSES);
    const { device } = unwrap(await this.findDevice.execute(mac), STATUSES);
    return unwrap(
      await this.activate.execute({
        deviceId: device.id,
        type,
        activatedBy: { source: 'admin', actorId: this.auth.staff().staffId },
        sourceId: null,
        multiActivate: false,
        resellerId: null,
      }),
      STATUSES,
    );
  }
}
