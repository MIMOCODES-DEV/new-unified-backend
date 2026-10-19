/**
 * DEVELOPMENT ONLY — not loaded in production (see api.module.ts).
 * Lets developers call the device use cases with plain JSON before the real doors exist
 * (old-app protocols: LEG tasks; new app API: v5). The brand comes from the Host header.
 */
import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { RegisterDeviceUseCase } from '../../../modules/devices/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';

const registerBody = z.object({ mac: z.string(), appType: z.string() });

@Controller('dev/devices')
export class DevDevicesController {
  constructor(private readonly registerDevice: RegisterDeviceUseCase) {}

  // curl -X POST localhost:3000/dev/devices/register -H "Host: cr7.localhost"
  //      -H "content-type: application/json" -d '{"mac":"AA:BB:CC:DD:EE:FF","appType":"samsung"}'
  @Public()
  @Post('register')
  @HttpCode(200)
  async register(@Body() body: unknown) {
    const input = registerBody.safeParse(body);
    if (!input.success) throw new BadRequestException(z.prettifyError(input.error));

    const result = await this.registerDevice.execute(input.data);
    if (!result.ok) throw result.error; // DomainError → 422 with its code (GlobalExceptionFilter)

    const { device, created } = result.value;
    const now = new Date();
    return {
      created,
      device: {
        id: device.id,
        mac: device.mac.value,
        appType: device.appType,
        deviceKey: device.deviceKey,
        state: device.state,
        license: {
          type: device.license.type,
          status: device.license.status(now),
          expiresAt: device.license.expiresAt,
        },
      },
    };
  }
}
