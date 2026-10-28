import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { LicensedDevices, type StaleTrial } from '../ports/licensed-devices.js';
import { LicensedPlaylists } from '../ports/licensed-playlists.js';

export interface CleanUpTrialDevicesInput {
  /** Report only; nothing is deleted. The default. */
  dryRun: boolean;
  /** A trial device not seen for this many days (and whose trial ended) is stale. */
  notSeenDays: number;
  /** At most this many devices per run. */
  limit: number;
}

export interface CleanUpReport {
  dryRun: boolean;
  /** The rule as dates: trial ended before, and not seen since. */
  endedBefore: Date;
  notSeenSince: Date;
  /** Stale trial devices found (at most `limit`). */
  found: number;
  /** True when `limit` was reached: more may be left for the next run. */
  limitReached: boolean;
  /** Deleted (0 in a dry run); a device seen or paid since it was listed is skipped. */
  deleted: number;
  skipped: number;
  /** Playlists deleted with the devices (should be 0: stale devices have none). */
  playlistsDeleted: number;
  /** The first devices found, to check the rule by eye. */
  sample: StaleTrial[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SAMPLE_SIZE = 20;

/**
 * LIC-4: removes trial devices nobody uses: the trial ended, no playlist was ever kept
 * (`playlistCount` 0), and the device was not seen for `notSeenDays`. A removed trial device takes
 * its playlists with it (by `deviceId`), so no orphans appear; paid devices are never removed.
 * A dry run (the default) only reports. Each device is checked again under the lock for its MAC
 * before it goes, so one that came back or paid meanwhile is kept.
 * Rule to agree before a real run (docs/modules/licensing.md); a device that is removed and comes
 * back registers as new, with a new trial.
 */
@Injectable()
export class CleanUpTrialDevicesUseCase {
  constructor(
    private readonly devices: LicensedDevices,
    private readonly playlists: LicensedPlaylists,
    private readonly clock: Clock,
  ) {}

  async execute(input: CleanUpTrialDevicesInput): Promise<CleanUpReport> {
    if (!Number.isInteger(input.notSeenDays) || input.notSeenDays < 1) {
      throw new Error('notSeenDays must be a whole number of days, at least 1');
    }
    const now = this.clock.now();
    const rule = {
      endedBefore: now,
      notSeenSince: new Date(now.getTime() - input.notSeenDays * DAY_MS),
    };
    const stale = await this.devices.listStaleTrials(rule, input.limit);

    let deleted = 0;
    let playlistsDeleted = 0;
    if (!input.dryRun) {
      for (const trial of stale) {
        const gone = await this.devices.deleteStaleTrial(trial.id, rule, async (deviceId) => {
          playlistsDeleted += await this.playlists.deleteAll(deviceId);
        });
        if (gone) deleted++;
      }
    }
    return {
      dryRun: input.dryRun,
      ...rule,
      found: stale.length,
      limitReached: stale.length >= input.limit,
      deleted,
      skipped: input.dryRun ? 0 : stale.length - deleted,
      playlistsDeleted,
      sample: stale.slice(0, SAMPLE_SIZE),
    };
  }
}
