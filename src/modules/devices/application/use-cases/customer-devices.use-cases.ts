import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { PaidDevice } from '../../domain/device.js';
import {
  DeviceKeyMismatchError,
  DeviceLinkedElsewhereError,
  DeviceNotFoundError,
  DeviceNotPaidError,
} from '../../domain/device.errors.js';
import { DeviceIdentity } from '../device-identity.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';

/**
 * CUS-3: a customer links a TV to the account with its MAC and device key, as the old site logged
 * in. A device belongs to one customer at most; linking it again to the same one is fine.
 */
@Injectable()
export class LinkDeviceToCustomerUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly paid: PaidDeviceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    mac: MacAddress;
    key: string;
    customerId: string;
  }): Promise<
    Result<PaidDevice, DeviceKeyMismatchError | DeviceNotPaidError | DeviceLinkedElsewhereError>
  > {
    const found = await this.identity.findByMac(input.mac);
    if (!found || found.device.deviceKey !== input.key) {
      return err(new DeviceKeyMismatchError('MAC address or device key is not correct'));
    }
    if (!found.paid) {
      return err(new DeviceNotPaidError('Only an activated device can be added to an account'));
    }
    const device = found.device;
    if (device.customerId === input.customerId) return ok(device);
    const linked =
      device.customerId === null &&
      (await this.paid.setCustomer(device.id, input.customerId, null, this.clock.now()));
    if (!linked) {
      return err(new DeviceLinkedElsewhereError('This device belongs to another account'));
    }
    return ok({ ...device, customerId: input.customerId });
  }
}

/** CUS-3: removes a device from the account; only its own customer can. */
@Injectable()
export class UnlinkDeviceFromCustomerUseCase {
  constructor(
    private readonly paid: PaidDeviceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    deviceId: string;
    customerId: string;
  }): Promise<Result<{ unlinked: true }, DeviceNotFoundError>> {
    const unlinked = await this.paid.setCustomer(
      input.deviceId,
      null,
      input.customerId,
      this.clock.now(),
    );
    return unlinked
      ? ok({ unlinked: true })
      : err(new DeviceNotFoundError('No such device on this account'));
  }
}

@Injectable()
export class ListCustomerDevicesUseCase {
  constructor(private readonly paid: PaidDeviceRepository) {}

  execute(customerId: string): Promise<PaidDevice[]> {
    return this.paid.findByCustomer(customerId);
  }
}
