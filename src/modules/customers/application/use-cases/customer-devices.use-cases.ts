import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { CustomerDeviceError } from '../../domain/customer.errors.js';
import { type CustomerDevice, CustomerDevices } from '../ports/customer-outside.js';

const LINK_ERRORS = {
  mismatch: ['customers.device_key_mismatch', 'MAC address or device key is not correct'],
  not_paid: ['customers.device_not_paid', 'Only an activated device can be added to an account'],
  linked_elsewhere: ['customers.device_linked_elsewhere', 'This device belongs to another account'],
} as const;

/** CUS-3: add a TV to the account with its MAC and device key. */
@Injectable()
export class LinkAccountDeviceUseCase {
  constructor(private readonly devices: CustomerDevices) {}

  async execute(input: {
    customerId: string;
    mac: string;
    deviceKey: string;
  }): Promise<Result<CustomerDevice, CustomerDeviceError>> {
    const outcome = await this.devices.link(input.mac, input.deviceKey, input.customerId);
    if (outcome.status === 'linked') return ok(outcome.device);
    const [code, message] = LINK_ERRORS[outcome.status];
    return err(new CustomerDeviceError(code, message));
  }
}

@Injectable()
export class UnlinkAccountDeviceUseCase {
  constructor(private readonly devices: CustomerDevices) {}

  async execute(input: {
    customerId: string;
    deviceId: string;
  }): Promise<Result<{ unlinked: true }, CustomerDeviceError>> {
    return (await this.devices.unlink(input.deviceId, input.customerId))
      ? ok({ unlinked: true })
      : err(
          new CustomerDeviceError('customers.device_not_found', 'No such device on this account'),
        );
  }
}

@Injectable()
export class ListAccountDevicesUseCase {
  constructor(private readonly devices: CustomerDevices) {}

  execute(customerId: string): Promise<CustomerDevice[]> {
    return this.devices.listFor(customerId);
  }
}
