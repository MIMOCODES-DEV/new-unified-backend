import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryPaidDeviceRepository,
  InMemoryTrialDeviceRepository,
  paidDevice,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import {
  devicesForLicensing,
  InMemoryLicenseRepository,
  InProcessLicenseLock,
  SwitchSettings,
} from '../../../../../test/support/license-fakes.js';
import { InMemoryPlaylistRepository } from '../../../../../test/support/playlist-fakes.js';
import { MoveDevicePlaylistsUseCase } from '../../../playlists/application/use-cases/move-device-playlists.use-case.js';
import type { Playlist } from '../../../playlists/domain/playlist.js';
import { Clock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { License } from '../../domain/license.js';
import { LicensedPlaylists } from '../ports/licensed-playlists.js';
import { SwitchMacUseCase } from './switch-mac.use-case.js';

const NOW = new Date('2026-10-27T10:00:00Z');
const OLD_MAC = '00:1a:2b:3c:4d:5f';
const NEW_MAC = '00:1a:2b:3c:4d:60';

class FixedClock extends Clock {
  now() {
    return new Date(NOW);
  }
}

function license(overrides: Partial<License> = {}): License {
  return {
    id: 'license-1',
    deviceId: 'paid-1',
    type: 'lifetime',
    expiresAt: null,
    revoked: false,
    revokedAt: null,
    activatedBy: { source: 'reseller', actorId: 'reseller-7' },
    creditCost: 2,
    multiActivate: false,
    sourceId: 'order-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function playlist(id: string, deviceId: string, name: string, url: string): Playlist {
  return {
    id,
    deviceId,
    name,
    type: 'm3u',
    url,
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
    createdAt: new Date(`2026-10-0${id.length % 9 || 1}T00:00:00Z`),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
}

describe('MAC switch (DEV-7)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let licenses: InMemoryLicenseRepository;
  let playlists: InMemoryPlaylistRepository;
  let settings: SwitchSettings;
  let switchMac: SwitchMacUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    licenses = new InMemoryLicenseRepository();
    playlists = new InMemoryPlaylistRepository();
    settings = new SwitchSettings();
    const clock = new FixedClock();
    const move = new MoveDevicePlaylistsUseCase(playlists, clock);
    const licensedPlaylists = new (class extends LicensedPlaylists {
      moveAll(fromDeviceId: string, toDeviceId: string) {
        return move.execute({ fromDeviceId, toDeviceId });
      }
      deleteAll(deviceId: string) {
        return playlists.deleteByDevice(deviceId);
      }
    })();
    switchMac = new SwitchMacUseCase(
      licenses,
      devicesForLicensing(trials, paid, settings, clock),
      licensedPlaylists,
      new InProcessLicenseLock(),
      clock,
    );
    await paid.insert(paidDevice({ macAddress: OLD_MAC }));
    await licenses.insert(license());
  });

  const run = (newMac = NEW_MAC, allowYearly = false) =>
    switchMac.execute({ deviceId: 'paid-1', newMac, allowYearly });
  /** The app installed on the new TV: a trial device on that MAC. */
  const newTv = (macAddress: string, id = `tv-${macAddress.slice(-2)}`) =>
    trials.insert(trialDevice({ id, macAddress }));

  it('moves the device to the new MAC with the same id, license and playlists', async () => {
    await newTv(NEW_MAC);
    await playlists.insert(playlist('own-1', 'paid-1', 'Sports', 'http://a.example/1.m3u'));

    const result = await run('00-1A-2B-3C-4D-60');

    expect(result.ok && result.value).toMatchObject({
      deviceId: 'paid-1',
      from: OLD_MAC,
      to: NEW_MAC,
      count: 1,
      absorbedTrialId: 'tv-60',
    });
    const device = await paid.findById('paid-1');
    expect(device?.macAddress).toBe(NEW_MAC);
    expect(device?.currentLicenseId).toBe('license-1');
    expect(device?.switch).toEqual({
      from: OLD_MAC,
      to: NEW_MAC,
      at: NOW,
      originMac: OLD_MAC,
      count: 1,
    });
    expect((await playlists.listByDevice('paid-1')).map((p) => p.id)).toEqual(['own-1']);
  });

  it("absorbs the new TV's trial device: its playlists move over, clashes renamed, duplicates dropped", async () => {
    await trials.insert(trialDevice({ id: 'trial-tv', macAddress: NEW_MAC }));
    await playlists.insert(playlist('own-1', 'paid-1', 'Sports', 'http://a.example/1.m3u'));
    await playlists.insert(playlist('tv-1', 'trial-tv', 'sports', 'http://b.example/2.m3u'));
    await playlists.insert(playlist('tv-22', 'trial-tv', 'Same link', 'http://a.example/1.m3u'));
    await playlists.insert(playlist('tv-333', 'trial-tv', 'Movies', 'http://c.example/3.m3u'));

    const result = await run();

    expect(result.ok && result.value).toMatchObject({
      absorbedTrialId: 'trial-tv',
      playlists: { moved: 2, renamed: 1, dropped: 1 },
    });
    expect(await trials.findById('trial-tv')).toBeNull();
    const names = (await playlists.listByDevice('paid-1')).map((p) => p.name).sort();
    expect(names).toEqual(['Movies', 'Sports', 'sports (2)']);
    expect(await playlists.listByDevice('trial-tv')).toEqual([]);
  });

  it('is refused when the current license has multiActivate', async () => {
    await licenses.update(license({ multiActivate: true }));
    const result = await run();
    expect(!result.ok && result.error.code).toBe('licensing.multi_activate_switch');
    expect((await paid.findById('paid-1'))?.macAddress).toBe(OLD_MAC);
  });

  it('is refused when the new MAC already belongs to a paid device; nothing changes', async () => {
    await paid.insert(paidDevice({ id: 'paid-2', macAddress: NEW_MAC, currentLicenseId: 'x' }));
    const result = await run();
    expect(!result.ok && result.error.code).toBe('licensing.mac_taken');
    expect((await paid.findById('paid-1'))?.macAddress).toBe(OLD_MAC);
    expect((await paid.findById('paid-2'))?.macAddress).toBe(NEW_MAC);
  });

  it('is refused when no app registered the new MAC yet (old: "install the app first")', async () => {
    const result = await run();
    expect(!result.ok && result.error.code).toBe('licensing.new_mac_not_registered');
    expect((await paid.findById('paid-1'))?.macAddress).toBe(OLD_MAC);
  });

  it('leaves an ended trial device on the old MAC, so the old TV gets no new trial', async () => {
    await newTv(NEW_MAC);
    expect((await run()).ok).toBe(true);
    const oldMac = MacAddress.parse(OLD_MAC);
    if (!oldMac.ok) throw oldMac.error;
    const left = await trials.findByMac(oldMac.value);
    expect(left).toMatchObject({ macAddress: OLD_MAC, playlistCount: 0 });
    expect(left!.trialEndsAt.getTime()).toBeLessThan(NOW.getTime());
  });

  it('switches a yearly license only when the caller allows it', async () => {
    await newTv(NEW_MAC);
    await licenses.update(
      license({ type: 'yearly', expiresAt: new Date('2027-10-27T23:59:59.999Z'), creditCost: 1 }),
    );
    const refused = await run();
    expect(!refused.ok && refused.error.code).toBe('licensing.yearly_switch_not_allowed');
    const allowed = await run(NEW_MAC, true);
    expect(allowed.ok).toBe(true);
  });

  it('is refused when the license is expired or revoked', async () => {
    await licenses.update(
      license({ type: 'yearly', expiresAt: new Date('2026-10-01T23:59:59.999Z') }),
    );
    const expired = await run(NEW_MAC, true);
    expect(!expired.ok && expired.error.code).toBe('licensing.license_not_running');

    await licenses.update(license({ revoked: true, revokedAt: NOW }));
    const revoked = await run();
    expect(!revoked.ok && revoked.error.code).toBe('licensing.license_not_running');
  });

  it('is refused for a trial device and an unknown device', async () => {
    await trials.insert(trialDevice({ id: 'trial-1', macAddress: '00:1a:2b:3c:4d:70' }));
    const trial = await switchMac.execute({ deviceId: 'trial-1', newMac: NEW_MAC });
    expect(!trial.ok && trial.error.code).toBe('licensing.switch_needs_paid_device');
    const unknown = await switchMac.execute({ deviceId: 'nope', newMac: NEW_MAC });
    expect(!unknown.ok && unknown.error.code).toBe('licensing.device_not_found');
  });

  it('refuses a bad, placeholder or unchanged MAC', async () => {
    expect(await run('not-a-mac')).toMatchObject({
      ok: false,
      error: { code: 'licensing.invalid_mac' },
    });
    expect(await run('52:54:00:12:34:57')).toMatchObject({
      ok: false,
      error: { code: 'licensing.invalid_mac' },
    });
    expect(await run(OLD_MAC)).toMatchObject({ ok: false, error: { code: 'licensing.same_mac' } });
  });

  it('allows one switch by default; the brand config sets how many', async () => {
    await newTv(NEW_MAC);
    await newTv('00:1a:2b:3c:4d:61');
    await newTv('00:1a:2b:3c:4d:62');
    expect((await run()).ok).toBe(true);
    const second = await run('00:1a:2b:3c:4d:61');
    expect(!second.ok && second.error.code).toBe('licensing.mac_switch_limit');

    settings.maxSwitches = 2;
    const allowed = await run('00:1a:2b:3c:4d:61');
    expect(allowed.ok && allowed.value.count).toBe(2);
    // The first MAC is kept across switches.
    expect((await paid.findById('paid-1'))?.switch).toMatchObject({
      from: NEW_MAC,
      to: '00:1a:2b:3c:4d:61',
      originMac: OLD_MAC,
      count: 2,
    });

    settings.maxSwitches = 0;
    await paid.update({ ...(await paid.findById('paid-1'))!, switch: null });
    const off = await run('00:1a:2b:3c:4d:62');
    expect(!off.ok && off.error.code).toBe('licensing.mac_switch_limit');
  });

  it('two switches at once: the license lock lets only one through', async () => {
    await newTv('00:1a:2b:3c:4d:61');
    await newTv('00:1a:2b:3c:4d:62');
    const [a, b] = await Promise.all([run('00:1a:2b:3c:4d:61'), run('00:1a:2b:3c:4d:62')]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect((await paid.findById('paid-1'))?.switch?.count).toBe(1);
  });
});
