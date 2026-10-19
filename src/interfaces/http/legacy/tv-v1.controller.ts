/**
 * Old-app door: v1, the oldest TV login. Still the real login of about 10 TV apps
 * (allplayer, duplex, familyplayer, iboxplayer, messiplayer, smartonepro, king4k…).
 * - POST /api/playlist_info   form data=<envelope> {mac_address, app_type, version}, no auth
 *   → {data: <envelope>} device info
 * Rules:
 * - Not an envelope → {status: "error"} (plain, like the old backends).
 * - No MAC → {status: "error", msg: "Sorry, Request Parameters are incomplete"}.
 * - Device already on V4 → refused, enveloped {status: "error", message: "error version"} (cr).
 * - Otherwise register-or-get: no captcha in v1, a new MAC gets a trial at once and
 *   mac_registered: false (true on later calls).
 * - An app type we don't know is stored as "unknown" instead of refusing the TV.
 */
import { Body, Controller, HttpCode, Ip, Post, UseFilters } from '@nestjs/common';
import {
  GetDeviceUseCase,
  parseAppType,
  RegisterDeviceUseCase,
} from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { decodeRequest, encodeResponse } from './ibo-envelope.js';
import { isV4Locked, legacyDeviceInfo } from './legacy-device.mapper.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';

type FormBody = Record<string, string | undefined> | undefined;

const INCOMPLETE = { status: 'error', msg: 'Sorry, Request Parameters are incomplete' };

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class TvV1Controller {
  constructor(
    private readonly getDevice: GetDeviceUseCase,
    private readonly registerDevice: RegisterDeviceUseCase,
  ) {}

  @LegacyDevice()
  @Post('playlist_info')
  @HttpCode(200)
  async playlistInfo(@Body() body: FormBody, @Ip() ip: string) {
    const request = decodeRequest(body?.data);
    if (!request) return { status: 'error' };
    const reply = (value: unknown) => ({ data: encodeResponse(value, request.key) });

    const mac = text(request.json.mac_address);
    if (!mac) return INCOMPLETE;
    const known = await this.getDevice.execute(mac);
    if (known && isV4Locked(known.device)) {
      return reply({ status: 'error', message: 'error version' });
    }

    const rawType = text(request.json.app_type);
    const appType = parseAppType(rawType).ok ? rawType : 'unknown';
    const result = await this.registerDevice.execute({ mac, appType });
    if (!result.ok) return INCOMPLETE;
    const { device, created, trialDays } = result.value;
    return reply(legacyDeviceInfo(device, { created, trialDays, ip }));
  }
}
