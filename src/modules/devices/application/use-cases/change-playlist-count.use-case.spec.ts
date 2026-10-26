import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryTrialDeviceRepository,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { ChangePlaylistCountUseCase } from './change-playlist-count.use-case.js';

const now = new Date('2026-10-26T10:00:00Z');

describe('ChangePlaylistCountUseCase (PL-2)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let change: ChangePlaylistCountUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    change = new ChangePlaylistCountUseCase(trials, new FixedClock(now));
    await trials.insert(trialDevice());
  });

  it('counts the first playlist and remembers when it came', async () => {
    await change.execute({ deviceId: 'trial-1', delta: 1 });

    expect(trials.items.get('trial-1')).toMatchObject({ playlistCount: 1, firstPlaylistAt: now });
  });

  it('keeps firstPlaylistAt after the playlist is deleted', async () => {
    await change.execute({ deviceId: 'trial-1', delta: 1 });
    await change.execute({ deviceId: 'trial-1', delta: -1 });

    expect(trials.items.get('trial-1')).toMatchObject({ playlistCount: 0, firstPlaylistAt: now });
  });

  it('never goes below 0', async () => {
    await change.execute({ deviceId: 'trial-1', delta: -3 });

    expect(trials.items.get('trial-1')?.playlistCount).toBe(0);
    expect(trials.items.get('trial-1')?.firstPlaylistAt).toBeNull();
  });

  it('does nothing for a paid device (it is not in trialDevices)', async () => {
    await expect(change.execute({ deviceId: 'paid-1', delta: 1 })).resolves.toBeUndefined();
  });
});
