/**
 * Old-app recovery routes (REC-2, REC-3), same paths and replies as the old backends. The owner made
 * a code on the website for a paid device; the app on the new TV sends it, and the paid device
 * moves to the new TV's MAC with its license and playlists (RecoverWithCodeUseCase).
 * - POST /api/:appType/v4/apply_recovery   V4 token of the new TV; plain body {recovery_code,
 *     new_mac_address, app_type} → plain {status, message, mac_address, is_trial, expire_date}
 * - POST /api/tv/v3/recover-summary        cr: {recovery_code, mac_address} → what would move; no change
 * - POST /api/tv/v3/recover-my-device      cr: the same, and it moves → {status, msg, data}
 * Unlike the old apply_recovery, which took any logged-in device's token, the token must be the new
 * TV's own: new_mac_address is its MAC. A paid device already on the new MAC is refused (the old
 * code gave it the old MAC and marked it for deletion).
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Ip,
  NotFoundException,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  FindDeviceByRecoveryCodeUseCase,
  FindDeviceUseCase,
} from '../../../modules/devices/index.js';
import { RecoverWithCodeUseCase } from '../../../modules/licensing/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { LegacyDevices } from './legacy-devices.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';
import type { LegacyDeviceInfo } from './legacy-info.js';
import { legacyLicense, platformOfPath } from './legacy-reply.js';

type JsonBody = Record<string, unknown> | undefined;

const DAY_MS = 24 * 60 * 60 * 1000;
const LABELS: Record<number, string> = {
  0: 'Trial',
  1: 'Deactivated',
  2: 'Lifetime',
  3: '1-Year Activation',
};

/** cr's v3 refusals, by our error code: [HTTP status, message]. */
const V3_ERRORS: Record<string, [number, string]> = {
  'licensing.recovery_code_not_found': [404, 'Invalid recovery code'],
  'licensing.recovery_code_expired': [410, 'Recovery code has expired. Please generate a new one.'],
  'licensing.new_mac_not_registered': [
    404,
    'New device is not registered. Install and open the app on the new device first.',
  ],
  'licensing.same_mac': [400, 'Source and destination devices are the same'],
  'licensing.license_not_running': [
    400,
    "The source device's subscription has expired. There is nothing to recover.",
  ],
  'licensing.mac_taken': [400, 'The destination device already has its own activation.'],
};

/** The V4 route's refusals, by our error code. */
const V4_ERRORS: Record<string, string> = {
  'licensing.same_mac': 'New MAC address is the same as the current one.',
  'licensing.mac_taken': 'This device already has its own activation.',
};

const normalizeCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class LegacyRecoveryController {
  constructor(
    private readonly devices: LegacyDevices,
    private readonly findDevice: FindDeviceUseCase,
    private readonly findByCode: FindDeviceByRecoveryCodeUseCase,
    private readonly recoverWithCode: RecoverWithCodeUseCase,
  ) {}

  @LegacyDevice()
  @Post(':appType/v4/apply_recovery')
  @HttpCode(200)
  async applyRecovery(
    @Param('appType') pathType: string,
    @Body() body: JsonBody,
    @Ip() ip: string,
    @Headers('authorization') authorization?: string,
  ) {
    const platform = platformOfPath(pathType);
    if (!platform) throw new NotFoundException();
    if (!authorization) {
      throw new HttpException({ status: 'error', message: 'Device login token is required' }, 401);
    }
    const caller = await this.devices.byToken(authorization);
    if (!caller || caller.device.platform !== platform) {
      throw new HttpException({ status: 'error', message: 'Invalid device login token' }, 403);
    }

    const code = text(body?.recovery_code).trim();
    const newMac = MacAddress.parse(text(body?.new_mac_address));
    const appType = text(body?.app_type).trim();
    if (!code || !text(body?.new_mac_address) || !appType) {
      return {
        status: 'error',
        message: 'recovery_code, new_mac_address, and app_type are required.',
      };
    }
    if (platformOfPath(appType) !== platform)
      return { status: 'error', message: 'Invalid app_type.' };
    if (!newMac.ok || newMac.value.value !== caller.device.macAddress) {
      throw new HttpException(
        { status: 'error', message: 'Token does not match request mac_address' },
        403,
      );
    }

    const recovered = await this.recoverWithCode.execute({ code, newMac: newMac.value.value });
    if (!recovered.ok) {
      return {
        status: 'error',
        message: V4_ERRORS[recovered.error.code] ?? 'Invalid or expired recovery code.',
      };
    }
    const after = await this.infoOf(newMac.value, ip);
    const license = after ? this.license(after) : null;
    return {
      status: 'success',
      message: 'Device recovery successful. Activation data has been transferred.',
      mac_address: newMac.value.value,
      is_trial: license?.is_trial ?? 0,
      expire_date: license?.expire_date ?? '',
    };
  }

  /** What a recovery would move, without moving it: the checks of recover-my-device, in order. */
  @LegacyDevice()
  @Post('tv/v3/recover-summary')
  @HttpCode(200)
  async summary(@Body() body: JsonBody, @Ip() ip: string) {
    const { code, mac } = this.v3Input(body);
    const holder = await this.findByCode.execute(normalizeCode(code));
    if (!holder.ok) this.v3Refuse('licensing.recovery_code_not_found');
    const paid = holder.value;
    if (!paid.recovery?.expiresAt || paid.recovery.expiresAt <= new Date()) {
      this.v3Refuse('licensing.recovery_code_expired');
    }
    const target = await this.findDevice.execute(mac);
    if (!target.ok) this.v3Refuse('licensing.new_mac_not_registered');
    if (target.value.device.id === paid.id) this.v3Refuse('licensing.same_mac');

    const source = await this.devices.info(
      { paid: true, device: paid },
      { platform: paid.platform, appVersion: null, ip, includePins: false },
    );
    if (!source.license.active) this.v3Refuse('licensing.license_not_running');
    if (target.value.paid) this.v3Refuse('licensing.mac_taken');
    const destination = await this.devices.info(target.value, {
      platform: target.value.device.platform,
      appVersion: null,
      ip,
      includePins: false,
    });

    const old = this.describe(source);
    const playlists = source.playlists.playlists.filter((p) => !p.demo).length;
    const activated = old.is_lifetime
      ? 'for Lifetime'
      : `as ${old.subscription_type} until ${old.expiry_description}`;
    const moved =
      playlists === 0 ? 'any playlists' : playlists === 1 ? '1 playlist' : `${playlists} playlists`;
    return {
      status: true,
      msg:
        `If you confirm recovery, your new device (${mac.value}) will be activated ${activated}, ` +
        `and ${moved} will be moved over from your old device (${paid.macAddress}). Your old device ` +
        'will stop working immediately after recovery and cannot be restored.',
      summary: {
        old_device: { mac_address: paid.macAddress, ...old, playlist_count: playlists },
        new_device: { mac_address: mac.value, ...this.describe(destination) },
        after_recovery: old,
        recovery_date: day(new Date()),
      },
    };
  }

  @LegacyDevice()
  @Post('tv/v3/recover-my-device')
  @HttpCode(200)
  async recoverMyDevice(@Body() body: JsonBody, @Ip() ip: string) {
    const { code, mac } = this.v3Input(body);
    const recovered = await this.recoverWithCode.execute({ code, newMac: mac.value });
    if (!recovered.ok) this.v3Refuse(recovered.error.code);
    const after = await this.infoOf(mac, ip);
    const license = after ? this.license(after) : null;
    return {
      status: true,
      msg: 'Device recovered successfully',
      data: {
        old_mac_address: recovered.value.from,
        new_mac_address: recovered.value.to,
        expire_date: license?.expire_date ?? '',
        is_trial: license?.is_trial ?? 0,
        recovered_date: day(recovered.value.at),
      },
    };
  }

  private v3Input(body: JsonBody) {
    const code = text(body?.recovery_code).trim();
    const mac = MacAddress.parse(text(body?.mac_address));
    if (!code || !mac.ok) {
      throw new HttpException(
        { status: false, msg: 'recovery_code and mac_address are required' },
        400,
      );
    }
    return { code, mac: mac.value };
  }

  private v3Refuse(code: string): never {
    const [status, msg] = V3_ERRORS[code] ?? [500, 'Server error performing recovery'];
    throw new HttpException({ status: false, msg }, status);
  }

  private async infoOf(mac: MacAddress, ip: string): Promise<LegacyDeviceInfo | null> {
    const found = await this.findDevice.execute(mac);
    if (!found.ok) return null;
    return this.devices.info(found.value, {
      platform: found.value.device.platform,
      appVersion: null,
      ip,
      includePins: false,
    });
  }

  private license(info: LegacyDeviceInfo) {
    return legacyLicense(info.license, false, info.now);
  }

  /** A device's subscription as cr's recovery summary described it. */
  private describe(info: LegacyDeviceInfo) {
    const { is_trial, expire_date } = this.license(info);
    const lifetime = is_trial === 2;
    const today = Date.parse(`${day(info.now)}T00:00:00Z`);
    const days = lifetime
      ? null
      : Math.round((Date.parse(`${expire_date}T00:00:00Z`) - today) / DAY_MS);
    const formatted = lifetime
      ? 'Lifetime'
      : new Date(`${expire_date}T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        });
    const description =
      days === null
        ? 'Lifetime'
        : days < 0
          ? `${formatted} (expired ${-days} day${days === -1 ? '' : 's'} ago)`
          : days === 0
            ? `${formatted} (expires today)`
            : `${formatted} (${days} day${days === 1 ? '' : 's'} remaining)`;
    return {
      expire_date,
      expire_date_formatted: formatted,
      expiry_description: description,
      days_remaining: days,
      subscription_type: LABELS[is_trial] ?? 'Unknown',
      is_trial,
      is_lifetime: lifetime,
    };
  }
}

const day = (date: Date) => date.toISOString().slice(0, 10);
