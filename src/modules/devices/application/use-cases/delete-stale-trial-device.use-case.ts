import { Injectable } from '@nestjs/common';
import { DeviceIdentity } from '../device-identity.js';
import type { StaleTrialQuery } from './list-stale-trial-devices.use-case.js';

export interface DeleteStaleTrialInput extends Omit<StaleTrialQuery, 'limit'> {
  deviceId: string;
  /** Runs first, with the device's id: removes its playlists. */
  removePlaylists: (deviceId: string) => Promise<void>;
}

/**
 * LIC-4: deletes one trial device the cleanup listed, under the lock for its MAC, only if it is
 * still stale then (not seen again, no playlist, not paid in the meantime). Its playlists go first,
 * so no orphans appear. Paid devices are never deleted. False when nothing was deleted.
 */
@Injectable()
export class DeleteStaleTrialDeviceUseCase {
  constructor(private readonly identity: DeviceIdentity) {}

  execute(input: DeleteStaleTrialInput): Promise<boolean> {
    return this.identity.deleteTrial(
      input.deviceId,
      (trial) =>
        trial.playlistCount === 0 &&
        trial.trialEndsAt < input.endedBefore &&
        trial.lastSeenAt < input.notSeenSince,
      (trial) => input.removePlaylists(trial.id),
    );
  }
}
