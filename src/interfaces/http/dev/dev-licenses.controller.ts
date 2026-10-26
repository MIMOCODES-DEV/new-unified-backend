import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { FindDeviceUseCase } from '../../../modules/devices/index.js';
import {
  ACTIVATION_SOURCES,
  ActivateLicenseUseCase,
  DeviceLicenseUseCase,
  LICENSE_TYPES,
  LicenseHistoryUseCase,
  RevokeLicenseUseCase,
} from '../../../modules/licensing/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import type { Result } from '../../../shared/kernel/result.js';
import { DevOnlyGuard } from './dev-only.guard.js';

function unwrap<T>(result: Result<T, Error>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

const mac = z.string().transform((value, ctx) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: 'Invalid MAC address' });
    return z.NEVER;
  }
  return parsed.value;
});

/**
 * Dev-only routes to try the Phase 1 license rules (LIC-1 to LIC-3) against a real database, for
 * the playground. Plain JSON, no auth; 404 in production. The device is named by MAC.
 */
@Controller('dev/licenses')
@UseGuards(DevOnlyGuard)
export class DevLicensesController {
  constructor(
    private readonly findDevice: FindDeviceUseCase,
    private readonly activate: ActivateLicenseUseCase,
    private readonly revoke: RevokeLicenseUseCase,
    private readonly state: DeviceLicenseUseCase,
    private readonly history: LicenseHistoryUseCase,
  ) {}

  private async deviceId(value: string): Promise<string> {
    return unwrap(await this.findDevice.execute(parse(mac, value))).device.id;
  }

  /** LIC-1/3: what the device may do now, worked out from the dates. */
  @Public()
  @Get(':mac')
  async current(@Param('mac') value: string) {
    return unwrap(await this.state.execute(await this.deviceId(value)));
  }

  /** LIC-3: every license, oldest first. */
  @Public()
  @Get(':mac/history')
  async all(@Param('mac') value: string) {
    return unwrap(await this.history.execute(await this.deviceId(value)));
  }

  /** LIC-2: activate from a source; the same sourceId twice activates once. */
  @Public()
  @Post(':mac/activate')
  async activateOne(@Param('mac') value: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        type: z.enum(LICENSE_TYPES),
        source: z.enum(ACTIVATION_SOURCES),
        actorId: z.string().nullable().default(null),
        sourceId: z.string().nullable().default(null),
        multiActivate: z.boolean().default(false),
        resellerId: z.string().nullable().default(null),
      }),
      body,
    );
    return unwrap(
      await this.activate.execute({
        deviceId: await this.deviceId(value),
        type: input.type,
        activatedBy: { source: input.source, actorId: input.actorId },
        sourceId: input.sourceId,
        multiActivate: input.multiActivate,
        resellerId: input.resellerId,
      }),
    );
  }

  /** LIC-3: revoke the current license; the device stays paid with no valid license. */
  @Public()
  @Post(':mac/revoke')
  async revokeOne(@Param('mac') value: string) {
    return unwrap(await this.revoke.execute({ deviceId: await this.deviceId(value) }));
  }
}
