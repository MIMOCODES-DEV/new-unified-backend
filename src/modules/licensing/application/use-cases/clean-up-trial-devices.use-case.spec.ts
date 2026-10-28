import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryPaidDeviceRepository,
  InMemoryTrialDeviceRepository,
  paidDevice,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import { devicesForLicensing } from '../../../../../test/support/license-fakes.js';
import { InMemoryPlaylistRepository } from '../../../../../test/support/playlist-fakes.js';
import type { Playlist } from '../../../playlists/domain/playlist.js';
import { Clock } from '../../../../shared/kernel/clock.js';
import { LicensedPlaylists } from '../ports/licensed-playlists.js';
import { CleanUpTrialDevicesUseCase } from './clean-up-trial-devices.use-case.js';

const NOW = new Date('2026-10-27T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

class FixedClock extends Clock {
  now() {
    return new Date(NOW);
  }
}

function playlist(id: string, deviceId: string): Playlist {
  return {
    id,
    deviceId,
    name: id,
    type: 'm3u',
    url: `http://a.example/${id}.m3u`,
    xtream: null,
    stalker: null,
    code: null,
    account: null,
    epgUrl: null,
    backup: { enabled: false, hosts: [] },
    protected: false,
    pinEnc: null,
    provider: null,
    addedBy: { via: 'app', resellerId: null },
    legacy: null,
    createdAt: daysAgo(400),
    updatedAt: daysAgo(400),
  };
}

describe('cleanup of stale trial devices (LIC-4)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let playlists: InMemoryPlaylistRepository;
  let cleanUp: CleanUpTrialDevicesUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    playlists = new InMemoryPlaylistRepository();
    const clock = new FixedClock();
    cleanUp = new CleanUpTrialDevicesUseCase(
      devicesForLicensing(trials, paid, undefined, clock),
      new (class extends LicensedPlaylists {
        moveAll(): never {
          throw new Error('the cleanup never moves playlists');
        }
        deleteAll(deviceId: string) {
          return playlists.deleteByDevice(deviceId);
        }
      })(),
      clock,
    );

    let mac = 0x10;
    const trial = (id: string, endedDaysAgo: number, seenDaysAgo: number, count = 0) =>
      trials.insert(
        trialDevice({
          id,
          macAddress: `00:1a:2b:3c:4d:${(mac++).toString(16)}`,
          trialEndsAt: daysAgo(endedDaysAgo),
          lastSeenAt: daysAgo(seenDaysAgo),
          playlistCount: count,
        }),
      );
    await trial('stale-old', 400, 390);
    await trial('stale', 200, 190);
    await trial('seen-lately', 200, 10);
    await trial('has-playlist', 400, 390, 1);
    await trial('running', -3, 400); // a trial that has not ended is never stale
    await paid.insert(paidDevice({ id: 'paid-old', lastSeenAt: daysAgo(900) }));
    await playlists.insert(playlist('kept', 'has-playlist'));
  });

  const run = (dryRun: boolean, limit = 100) =>
    cleanUp.execute({ dryRun, notSeenDays: 180, limit });

  it('a dry run reports the stale trial devices and deletes nothing', async () => {
    const report = await run(true);

    expect(report).toMatchObject({
      dryRun: true,
      found: 2,
      deleted: 0,
      skipped: 0,
      limitReached: false,
      endedBefore: NOW,
      notSeenSince: daysAgo(180),
    });
    expect(report.sample.map((t) => t.id)).toEqual(['stale-old', 'stale']);
    expect(trials.items.size).toBe(5);
  });

  it('a real run deletes ended trials with no playlist that were not seen for the days given', async () => {
    const report = await run(false);

    expect(report).toMatchObject({ dryRun: false, found: 2, deleted: 2, skipped: 0 });
    expect([...trials.items.keys()].sort()).toEqual(['has-playlist', 'running', 'seen-lately']);
    expect(await paid.findById('paid-old')).not.toBeNull();
    expect((await playlists.listByDevice('has-playlist')).map((p) => p.id)).toEqual(['kept']);
  });

  it('takes stray playlists with the device, so no orphans are left', async () => {
    // playlistCount says 0, but a row is there (counter drift): it goes with its device.
    await playlists.insert(playlist('stray', 'stale'));
    const report = await run(false);

    expect(report.playlistsDeleted).toBe(1);
    expect(await playlists.listByDevice('stale')).toEqual([]);
  });

  it('keeps a device that came back after it was listed', async () => {
    const original = trials.listStale.bind(trials);
    trials.listStale = async (...args) => {
      const listed = await original(...args);
      const back = trials.items.get('stale')!;
      trials.items.set('stale', { ...back, lastSeenAt: NOW });
      return listed;
    };

    const report = await run(false);
    expect(report).toMatchObject({ found: 2, deleted: 1, skipped: 1 });
    expect(trials.items.has('stale')).toBe(true);
  });

  it('stops at the limit and says more may be left', async () => {
    const report = await run(false, 1);
    expect(report).toMatchObject({ found: 1, deleted: 1, limitReached: true });
    expect(trials.items.has('stale-old')).toBe(false);
    expect(trials.items.has('stale')).toBe(true);
  });

  it('refuses a rule that is not a whole number of days', async () => {
    await expect(cleanUp.execute({ dryRun: true, notSeenDays: 0, limit: 10 })).rejects.toThrow();
  });
});
