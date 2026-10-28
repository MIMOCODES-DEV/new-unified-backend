import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { Clock } from '../../../../shared/kernel/clock.js';
import { MAX_DEVICE_NAME } from '../../domain/customer.js';
import { CustomerDeviceError, InvalidCustomerInputError } from '../../domain/customer.errors.js';
import { type CustomerDevice, CustomerDevices } from '../ports/customer-outside.js';
import { CustomerRepository } from '../ports/customer.repository.js';

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

/** CUS-3: removes a TV from the account, with the name the customer gave it. */
@Injectable()
export class UnlinkAccountDeviceUseCase {
  constructor(
    private readonly devices: CustomerDevices,
    private readonly customers: CustomerRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    customerId: string;
    deviceId: string;
  }): Promise<Result<{ unlinked: true }, CustomerDeviceError>> {
    if (!(await this.devices.unlink(input.deviceId, input.customerId))) {
      return err(
        new CustomerDeviceError('customers.device_not_found', 'No such device on this account'),
      );
    }
    const customer = await this.customers.findById(input.customerId);
    if (customer?.deviceNames.some((n) => n.deviceId === input.deviceId)) {
      await this.customers.update({
        ...customer,
        deviceNames: customer.deviceNames.filter((n) => n.deviceId !== input.deviceId),
        updatedAt: this.clock.now(),
      });
    }
    return ok({ unlinked: true });
  }
}

/** A linked TV with the name the customer gave it (null when none). */
export interface AccountDevice extends CustomerDevice {
  readonly name: string | null;
}

@Injectable()
export class ListAccountDevicesUseCase {
  constructor(
    private readonly devices: CustomerDevices,
    private readonly customers: CustomerRepository,
  ) {}

  async execute(customerId: string): Promise<AccountDevice[]> {
    const [devices, customer] = await Promise.all([
      this.devices.listFor(customerId),
      this.customers.findById(customerId),
    ]);
    const names = new Map(customer?.deviceNames.map((n) => [n.deviceId, n.name]) ?? []);
    return devices.map((d) => ({ ...d, name: names.get(d.id) ?? null }));
  }
}

/** The old site's "change device name": a label for a linked TV; empty or null removes it. */
@Injectable()
export class NameAccountDeviceUseCase {
  constructor(
    private readonly devices: CustomerDevices,
    private readonly customers: CustomerRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    customerId: string;
    deviceId: string;
    name: string | null;
  }): Promise<
    Result<
      { deviceId: string; name: string | null },
      CustomerDeviceError | InvalidCustomerInputError
    >
  > {
    const name = input.name?.trim() || null;
    if (name !== null && name.length > MAX_DEVICE_NAME) {
      return err(
        new InvalidCustomerInputError(`A device name is at most ${MAX_DEVICE_NAME} characters`),
      );
    }
    const linked = (await this.devices.listFor(input.customerId)).some(
      (d) => d.id === input.deviceId,
    );
    const customer = linked ? await this.customers.findById(input.customerId) : null;
    if (!customer) {
      return err(
        new CustomerDeviceError('customers.device_not_found', 'No such device on this account'),
      );
    }
    const others = customer.deviceNames.filter((n) => n.deviceId !== input.deviceId);
    await this.customers.update({
      ...customer,
      deviceNames: name === null ? others : [...others, { deviceId: input.deviceId, name }],
      updatedAt: this.clock.now(),
    });
    return ok({ deviceId: input.deviceId, name });
  }
}
