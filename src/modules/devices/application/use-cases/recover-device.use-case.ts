import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { PaidDevice } from '../../domain/device.js';
import {
  DeviceNotFoundError,
  type MacInUseError,
  NewMacNotRegisteredError,
  SameMacError,
  UsableMacRequiredError,
} from '../../domain/device.errors.js';
import { isUsableMac } from '../../domain/device-mac.js';
import { DeviceIdentity } from '../device-identity.js';
import { endedTrialOnOldMac } from '../ended-trial.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';

export interface RecoverDeviceInput {
  deviceId: string;
  /** The new TV's MAC; its app is installed, so a device is registered on it. */
  newMac: string;
  /**
   * Called with the new TV's trial device before it is deleted: removes what it had (its
   * playlists), so nothing is left behind (REC-3).
   */
  removeTrial: (trialDeviceId: string) => Promise<void>;
}

export interface RecoverDeviceOutput {
  device: PaidDevice;
  /** The new TV's trial device, removed; null when the MAC had none. */
  removedTrialId: string | null;
}

export type RecoverDeviceError =
  | DeviceNotFoundError
  | InvalidMacAddressError
  | UsableMacRequiredError
  | SameMacError
  | NewMacNotRegisteredError
  | MacInUseError;

/**
 * REC-2 and REC-3, the devices side of a recovery: the paid device takes the new TV's MAC and keeps
 * its id (so its license and playlists follow). The new TV's own trial device is removed with what
 * it had; a paid device on the new MAC refuses it. The old MAC keeps an ended trial device, so the
 * old TV gets no new trial. `recovery` records the old MAC and when, and the code is cleared (it
 * works once). A recovery does not count as a MAC switch. Licensing checks the code and the license
 * first, under its lock for the device.
 */
@Injectable()
export class RecoverDeviceUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly paid: PaidDeviceRepository,
    private readonly keys: DeviceKeyGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RecoverDeviceInput,
  ): Promise<Result<RecoverDeviceOutput, RecoverDeviceError>> {
    const parsed = MacAddress.parse(input.newMac);
    if (!parsed.ok) return parsed;
    const newMac = parsed.value;
    if (!isUsableMac(newMac)) {
      return err(new UsableMacRequiredError('A recovery needs a real MAC', { mac: newMac.value }));
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

    const at = this.clock.now();
    let removedTrialId: string | null = null;
    const changed = await this.identity.changeMac(
      device.id,
      newMac,
      (current) => ({
        ...current,
        recovery: {
          code: null,
          expiresAt: null,
          enabled: current.recovery?.enabled ?? false,
          recoveredFrom: current.macAddress,
          recoveredAt: at,
        },
        updatedAt: at,
      }),
      {
        absorb: async (trial) => {
          removedTrialId = trial.id;
          await input.removeTrial(trial.id);
        },
        leaveBehind: (oldMac) => endedTrialOnOldMac(device, oldMac, this.keys.next(), at),
      },
    );
    if (!changed.ok) return changed;
    return ok({ device: changed.value, removedTrialId });
  }
}
