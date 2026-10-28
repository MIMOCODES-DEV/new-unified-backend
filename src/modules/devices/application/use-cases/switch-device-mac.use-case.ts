import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { PaidDevice } from '../../domain/device.js';
import {
  DeviceNotFoundError,
  MacSwitchLimitError,
  type MacInUseError,
  NewMacNotRegisteredError,
  SameMacError,
  UsableMacRequiredError,
} from '../../domain/device.errors.js';
import { isUsableMac } from '../../domain/device-mac.js';
import { DeviceIdentity } from '../device-identity.js';
import { endedTrialOnOldMac } from '../ended-trial.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';

export interface SwitchDeviceMacInput {
  deviceId: string;
  newMac: string;
  /**
   * Called with the trial device that has the new MAC (the new TV registered itself), before that
   * device is deleted: takes over what it had (its playlists).
   */
  takeOver: (trialDeviceId: string) => Promise<void>;
}

export interface SwitchDeviceMacOutput {
  device: PaidDevice;
  /** The trial device that had the new MAC and was absorbed; null when the MAC was free. */
  absorbedTrialId: string | null;
}

export type SwitchDeviceMacError =
  | DeviceNotFoundError
  | InvalidMacAddressError
  | UsableMacRequiredError
  | SameMacError
  | MacSwitchLimitError
  | NewMacNotRegisteredError
  | MacInUseError;

/**
 * DEV-7, the devices side of a MAC switch: a paid device takes a new MAC and keeps its id (so its
 * license and playlists follow). Like the old backends:
 * - The new MAC must already have a device (the app was installed on the new TV), so a typo never
 *   sends a license to a stranger. Its trial device is absorbed; a paid one refuses the switch.
 * - The old MAC keeps an ended trial device, so the old TV gets no new trial.
 * `switch` records from, to, when, the first MAC and how many switches; the brand config caps how
 * many (`macSwitch.maxPerDevice`, 1 by default). Licensing checks the license first.
 */
@Injectable()
export class SwitchDeviceMacUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly paid: PaidDeviceRepository,
    private readonly settings: DeviceSettings,
    private readonly keys: DeviceKeyGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SwitchDeviceMacInput,
  ): Promise<Result<SwitchDeviceMacOutput, SwitchDeviceMacError>> {
    const parsed = MacAddress.parse(input.newMac);
    if (!parsed.ok) return parsed;
    const newMac = parsed.value;
    if (!isUsableMac(newMac)) {
      return err(
        new UsableMacRequiredError('A MAC switch needs a real MAC', { mac: newMac.value }),
      );
    }

    const device = await this.paid.findById(input.deviceId);
    if (!device) {
      return err(new DeviceNotFoundError('Paid device not found', { deviceId: input.deviceId }));
    }
    if (device.macAddress === newMac.value) {
      return err(new SameMacError('The device already has this MAC', { mac: newMac.value }));
    }
    if (!(await this.identity.findByMac(newMac))) {
      return err(
        new NewMacNotRegisteredError('Install the app on the new device first', {
          mac: newMac.value,
        }),
      );
    }
    const done = device.switch?.count ?? 0;
    const max = await this.settings.maxMacSwitches();
    if (done >= max) {
      return err(new MacSwitchLimitError('This device cannot switch its MAC again', { done, max }));
    }

    const at = this.clock.now();
    let absorbedTrialId: string | null = null;
    const changed = await this.identity.changeMac(
      device.id,
      newMac,
      (current) => ({
        ...current,
        switch: {
          from: current.macAddress,
          to: newMac.value,
          at,
          originMac: current.switch?.originMac ?? current.macAddress,
          count: (current.switch?.count ?? 0) + 1,
        },
        updatedAt: at,
      }),
      {
        absorb: async (trial) => {
          absorbedTrialId = trial.id;
          await input.takeOver(trial.id);
        },
        leaveBehind: (oldMac) => endedTrialOnOldMac(device, oldMac, this.keys.next(), at),
      },
    );
    if (!changed.ok) return changed;
    return ok({ device: changed.value, absorbedTrialId });
  }
}
