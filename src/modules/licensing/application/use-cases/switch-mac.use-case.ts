import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { deviceLicense } from '../../domain/license-rules.js';
import {
  InvalidSwitchMacError,
  LicensedDeviceNotFoundError,
  LicenseNotRunningError,
  MacSwitchLimitError,
  MacTakenError,
  MultiActivateSwitchError,
  NewMacNotRegisteredError,
  SameMacError,
  SwitchNeedsPaidDeviceError,
  YearlySwitchNotAllowedError,
} from '../../domain/licensing.errors.js';
import { LicenseLock } from '../ports/license-lock.js';
import { LicenseRepository } from '../ports/license.repository.js';
import { LicensedDevices } from '../ports/licensed-devices.js';
import { LicensedPlaylists, type MovedPlaylists } from '../ports/licensed-playlists.js';

export interface SwitchMacInput {
  deviceId: string;
  newMac: string;
  /** Lets a yearly license switch too (old `allow_one_year`); otherwise only lifetime switches. */
  allowYearly?: boolean;
}

export interface SwitchMacOutput {
  deviceId: string;
  from: string;
  to: string;
  at: Date;
  /** Switches made so far, this one included. */
  count: number;
  /** The new TV's trial device, absorbed into this one; null when the MAC was free. */
  absorbedTrialId: string | null;
  /** What happened to the absorbed trial device's playlists. */
  playlists: MovedPlaylists;
}

export type SwitchMacError =
  | LicensedDeviceNotFoundError
  | SwitchNeedsPaidDeviceError
  | LicenseNotRunningError
  | MultiActivateSwitchError
  | YearlySwitchNotAllowedError
  | InvalidSwitchMacError
  | SameMacError
  | MacSwitchLimitError
  | NewMacNotRegisteredError
  | MacTakenError;

const NOTHING_MOVED: MovedPlaylists = { moved: 0, renamed: 0, dropped: 0 };

/**
 * DEV-7: moves a paid device's license to a new MAC. The device keeps its id, so its license and
 * playlists follow. Refused unless the current license is running, not from a multi-device order,
 * and lifetime (or yearly with `allowYearly`); the brand caps how many switches a device makes.
 * The new MAC must already be registered (the app installed on the new TV, as the old backends
 * required); its trial device is absorbed: its playlists move over and it is deleted. A paid device
 * on the new MAC refuses the switch. The old MAC keeps an ended trial device, so the old TV gets no
 * new trial. Runs under the device's license lock.
 */
@Injectable()
export class SwitchMacUseCase {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly devices: LicensedDevices,
    private readonly playlists: LicensedPlaylists,
    private readonly lock: LicenseLock,
    private readonly clock: Clock,
  ) {}

  execute(input: SwitchMacInput): Promise<Result<SwitchMacOutput, SwitchMacError>> {
    return this.lock.withDevice(input.deviceId, () => this.switchMac(input));
  }

  private async switchMac(input: SwitchMacInput): Promise<Result<SwitchMacOutput, SwitchMacError>> {
    const device = await this.devices.find(input.deviceId);
    if (!device) {
      return err(new LicensedDeviceNotFoundError('Device not found', { deviceId: input.deviceId }));
    }
    if (!device.paid || !device.currentLicenseId) {
      return err(new SwitchNeedsPaidDeviceError('Only a paid device can switch its MAC'));
    }
    const current = await this.licenses.findById(device.currentLicenseId);
    const state = deviceLicense({ trialEndsAt: null, current }, this.clock.now());
    if (!current || !state.active) {
      return err(
        new LicenseNotRunningError('Only a running license can move to a new MAC', {
          state: state.state,
        }),
      );
    }
    if (current.multiActivate) {
      return err(
        new MultiActivateSwitchError('A license from a multi-device order cannot switch MAC'),
      );
    }
    if (current.type === 'yearly' && !input.allowYearly) {
      return err(new YearlySwitchNotAllowedError('Only a lifetime license can switch MAC'));
    }

    let playlists = NOTHING_MOVED;
    const outcome = await this.devices.switchMac(device.id, input.newMac, async (trialId) => {
      playlists = await this.playlists.moveAll(trialId, device.id);
    });
    switch (outcome.status) {
      case 'done':
        return ok({
          deviceId: device.id,
          from: outcome.from,
          to: outcome.to,
          at: outcome.at,
          count: outcome.count,
          absorbedTrialId: outcome.absorbedTrialId,
          playlists,
        });
      case 'not_found':
        return err(new LicensedDeviceNotFoundError('Device not found', { deviceId: device.id }));
      case 'invalid_mac':
        return err(new InvalidSwitchMacError('The new MAC is not a usable MAC'));
      case 'same_mac':
        return err(new SameMacError('The device already has this MAC'));
      case 'limit_reached':
        return err(new MacSwitchLimitError('This device cannot switch its MAC again'));
      case 'not_registered':
        return err(
          new NewMacNotRegisteredError('Install the app on the new device first, then switch'),
        );
      case 'mac_taken':
        return err(new MacTakenError('The new MAC already belongs to a paid device'));
    }
  }
}
