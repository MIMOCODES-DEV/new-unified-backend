import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { deviceLicense } from '../../domain/license-rules.js';
import {
  InvalidSwitchMacError,
  LicensedDeviceNotFoundError,
  LicenseNotRunningError,
  MacTakenError,
  NewMacNotRegisteredError,
  RecoveryCodeExpiredError,
  RecoveryCodeNotFoundError,
  SameMacError,
} from '../../domain/licensing.errors.js';
import { normalizeRecoveryCode } from '../../domain/recovery-code.js';
import { LicenseLock } from '../ports/license-lock.js';
import { LicenseRepository } from '../ports/license.repository.js';
import { LicensedDevices } from '../ports/licensed-devices.js';
import { LicensedPlaylists } from '../ports/licensed-playlists.js';

export interface RecoverWithCodeInput {
  /** As typed on the new TV: case and spaces around it do not matter. */
  code: string;
  /** The new TV's MAC. */
  newMac: string;
}

export interface RecoverWithCodeOutput {
  deviceId: string;
  from: string;
  to: string;
  at: Date;
  /** The new TV's own trial device, removed; null when it had none. */
  removedTrialId: string | null;
  /** How many playlists that trial device had (removed with it). */
  removedPlaylists: number;
}

export type RecoverWithCodeError =
  | RecoveryCodeNotFoundError
  | RecoveryCodeExpiredError
  | LicensedDeviceNotFoundError
  | LicenseNotRunningError
  | InvalidSwitchMacError
  | SameMacError
  | NewMacNotRegisteredError
  | MacTakenError;

/**
 * REC-2 and REC-3: the new TV sends a recovery code and gets the paid device. The device takes the
 * new TV's MAC and keeps its id, license and playlists. The new TV's own trial device is removed
 * with its playlists, so after a recovery each MAC belongs to exactly one device (the old MAC keeps
 * an ended trial device, so the old TV gets no new trial). A code works once; a wrong or expired
 * code, or a license that is no longer running, is refused. Runs under the device's license lock,
 * which also holds both MACs while the device moves.
 */
@Injectable()
export class RecoverWithCodeUseCase {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly devices: LicensedDevices,
    private readonly playlists: LicensedPlaylists,
    private readonly lock: LicenseLock,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RecoverWithCodeInput,
  ): Promise<Result<RecoverWithCodeOutput, RecoverWithCodeError>> {
    const code = normalizeRecoveryCode(input.code);
    const holder = code ? await this.devices.findByRecoveryCode(code) : null;
    if (!code || !holder) return err(new RecoveryCodeNotFoundError('Wrong recovery code'));
    return this.lock.withDevice(holder.id, () => this.recover(holder.id, code, input.newMac));
  }

  private async recover(
    deviceId: string,
    code: string,
    newMac: string,
  ): Promise<Result<RecoverWithCodeOutput, RecoverWithCodeError>> {
    // Read again under the lock: a second TV sending the same code waits, then finds it used.
    const holder = await this.devices.findByRecoveryCode(code);
    if (!holder || holder.id !== deviceId) {
      return err(new RecoveryCodeNotFoundError('Wrong recovery code'));
    }
    const now = this.clock.now();
    if (!holder.expiresAt || holder.expiresAt <= now) {
      return err(new RecoveryCodeExpiredError('This recovery code has expired; make a new one'));
    }
    const device = await this.devices.find(deviceId);
    if (!device?.paid || !device.currentLicenseId) {
      return err(new LicensedDeviceNotFoundError('Device not found', { deviceId }));
    }
    const current = await this.licenses.findById(device.currentLicenseId);
    const state = deviceLicense({ trialEndsAt: null, current }, now);
    if (!state.active) {
      return err(
        new LicenseNotRunningError('Only a running license can be recovered', {
          state: state.state,
        }),
      );
    }

    let removedPlaylists = 0;
    const outcome = await this.devices.recover(deviceId, newMac, async (trialId) => {
      removedPlaylists = await this.playlists.deleteAll(trialId);
    });
    switch (outcome.status) {
      case 'done':
        return ok({
          deviceId,
          from: outcome.from,
          to: outcome.to,
          at: outcome.at,
          removedTrialId: outcome.removedTrialId,
          removedPlaylists,
        });
      case 'not_found':
        return err(new LicensedDeviceNotFoundError('Device not found', { deviceId }));
      case 'invalid_mac':
        return err(new InvalidSwitchMacError('The new MAC is not a usable MAC'));
      case 'same_mac':
        return err(new SameMacError('The device already has this MAC'));
      case 'not_registered':
        return err(
          new NewMacNotRegisteredError('Install the app on the new device first, then recover'),
        );
      case 'mac_taken':
        return err(new MacTakenError('The new MAC already belongs to a paid device'));
    }
  }
}
