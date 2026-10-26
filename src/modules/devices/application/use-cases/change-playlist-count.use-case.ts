import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { TrialDeviceRepository } from '../ports/trial-device.repository.js';

export interface ChangePlaylistCountInput {
  deviceId: string;
  /** +n when playlists were added, -n when removed. */
  delta: number;
}

/**
 * Keeps playlistCount and firstPlaylistAt of a trial device in step with its playlists (PL-2).
 * The cleanup of old trials reads them. A paid device has no counters: nothing is written.
 */
@Injectable()
export class ChangePlaylistCountUseCase {
  constructor(
    private readonly trials: TrialDeviceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChangePlaylistCountInput): Promise<void> {
    if (input.delta === 0) return;
    await this.trials.changePlaylistCount(input.deviceId, input.delta, this.clock.now());
  }
}
