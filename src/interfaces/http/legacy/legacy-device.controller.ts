/**
 * Old-app device routes, same paths and replies as the old backends.
 * - POST /api/changeParentPin   form or JSON {data: <envelope>} {mac_address, pin_code}
 *     4 digits turn parental control on with that PIN; "" or null turn it off.
 *     → {data: <envelope>} {status, msg}; a body that cannot be read gets plain {status, msg}.
 *   No token, as before: the apps send it from the settings page with the MAC only.
 */
import { Body, Controller, HttpCode, Post, UseFilters } from '@nestjs/common';
import { FindDeviceUseCase, SetParentPinUseCase } from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { decodeRequest, encodeResponse } from './ibo-envelope.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';

type Body = Record<string, unknown> | undefined;

const NOT_CORRECT = { status: 'error', msg: 'Sorry, request is not correct' };

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class LegacyDeviceController {
  constructor(
    private readonly findDevice: FindDeviceUseCase,
    private readonly setParentPin: SetParentPinUseCase,
  ) {}

  @LegacyDevice()
  @Post('changeParentPin')
  @HttpCode(200)
  async changeParentPin(@Body() body: Body) {
    const request = decodeRequest(body?.data);
    if (!request) return NOT_CORRECT;
    const reply = (value: object) => ({ data: encodeResponse(value, request.key) });

    const raw = request.json.pin_code;
    const pin = typeof raw === 'number' ? String(raw) : raw;
    const mac = MacAddress.parse(text(request.json.mac_address));
    if (!mac.ok || pin === undefined || (pin !== null && typeof pin !== 'string')) {
      return reply(NOT_CORRECT);
    }
    const found = await this.findDevice.execute(mac.value);
    if (!found.ok) return reply({ status: 'error', msg: 'Sorry, device does not exist' });

    const set = await this.setParentPin.execute({ deviceId: found.value.device.id, pin });
    if (!set.ok) return reply(NOT_CORRECT);
    return reply({ status: 'success', msg: 'Pin code updated successfully' });
  }
}
