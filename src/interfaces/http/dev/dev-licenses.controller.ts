import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { FindDeviceUseCase } from '../../../modules/devices/index.js';
import {
  ACTIVATION_SOURCES,
  ActivateLicenseUseCase,
  CleanUpTrialDevicesUseCase,
  CreateRecoveryCodeUseCase,
  DeviceLicenseUseCase,
  LICENSE_TYPES,
  LicenseHistoryUseCase,
  RecoverWithCodeUseCase,
  RevokeLicenseUseCase,
  SwitchMacUseCase,
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
 * Dev-only routes to try the license rules (LIC-1 to LIC-4, DEV-7, REC-1 to REC-3) against a real database, for
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
    private readonly switchMac: SwitchMacUseCase,
    private readonly createCode: CreateRecoveryCodeUseCase,
    private readonly recoverWithCode: RecoverWithCodeUseCase,
    private readonly cleanUp: CleanUpTrialDevicesUseCase,
  ) {}

  /** LIC-4: what the cleanup would remove now. A dry run only: nothing is deleted from here. */
  @Public()
  @Get('cleanup')
  async cleanupReport(@Query('days') days?: string) {
    const notSeenDays = parse(z.coerce.number().int().min(1).default(180), days);
    return this.cleanUp.execute({ dryRun: true, notSeenDays, limit: 1000 });
  }

  /** REC-2/3: the new TV sends the code made on the website and gets the paid device. */
  @Public()
  @Post('recover')
  async recover(@Body() body: unknown) {
    const input = parse(z.object({ code: z.string(), newMac: z.string() }), body);
    return unwrap(await this.recoverWithCode.execute(input));
  }

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

  /** REC-1: a recovery code for a paid device (the website's "move to a new TV"). */
  @Public()
  @Post(':mac/recovery-code')
  async recoveryCode(@Param('mac') value: string) {
    return unwrap(await this.createCode.execute({ deviceId: await this.deviceId(value) }));
  }

  /**
   * DEV-7: move the device's license to a new MAC. The new MAC is passed as typed, so the switch
   * itself refuses a bad or placeholder MAC.
   */
  @Public()
  @Post(':mac/switch')
  async switchOne(@Param('mac') value: string, @Body() body: unknown) {
    const input = parse(
      z.object({ newMac: z.string(), allowYearly: z.boolean().default(false) }),
      body,
    );
    return unwrap(
      await this.switchMac.execute({
        deviceId: await this.deviceId(value),
        newMac: input.newMac,
        allowYearly: input.allowYearly,
      }),
    );
  }
}
