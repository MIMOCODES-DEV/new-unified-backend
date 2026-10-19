import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Device } from '../../domain/device.entity.js';
import { DeviceNotFoundError } from '../../domain/device.errors.js';
import { DeviceRepository } from '../ports/device.repository.js';

export type ActivateOutcome = 'activated' | 'already_paid';

export interface ActivateDeviceOutput {
  device: Device;
  outcome: ActivateOutcome;
}

/**
 * The only way a device enters `devices`: called when it pays (payment, reseller code, coupon,
 * admin, store). Moves it from `pendingDevices`, keeping its id and device key.
 */
@Injectable()
export class ActivateDeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    macAddress: string;
  }): Promise<Result<ActivateDeviceOutput, InvalidMacAddressError | DeviceNotFoundError>> {
    const mac = MacAddress.parse(input.macAddress);
    if (!mac.ok) return mac;

    const paid = await this.devices.findPaidByMac(mac.value);
    if (paid) return ok({ device: paid, outcome: 'already_paid' });

    const pending = await this.devices.findPendingByMac(mac.value);
    if (!pending) {
      return err(
        new DeviceNotFoundError('No device with this MAC', { macAddress: mac.value.value }),
      );
    }

    pending.activate(this.clock.now());
    if ((await this.devices.moveToPaid(pending)) === 'moved') {
      return ok({ device: pending, outcome: 'activated' });
    }

    // Another activation moved it first. Only the move deletes pending records, so it is paid now.
    const winner = await this.devices.findPaidByMac(mac.value);
    if (!winner) throw new Error(`Device ${mac.value.value} is neither pending nor paid`);
    return ok({ device: winner, outcome: 'already_paid' });
  }
}
