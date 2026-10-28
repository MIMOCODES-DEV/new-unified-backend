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
} from '../../../../../test/support/license-fakes.js';
import { InMemoryPlaylistRepository } from '../../../../../test/support/playlist-fakes.js';
import type { Playlist } from '../../../playlists/domain/playlist.js';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { License } from '../../domain/license.js';
import { normalizeRecoveryCode, RECOVERY_CODE_ALPHABET } from '../../domain/recovery-code.js';
import { RandomRecoveryCodeGenerator } from '../../infrastructure/random-recovery-code.generator.js';
import { LicensedPlaylists } from '../ports/licensed-playlists.js';
import { RecoveryCodeGenerator } from '../ports/recovery-code-generator.js';
import { CreateRecoveryCodeUseCase } from './create-recovery-code.use-case.js';
import { RecoverWithCodeUseCase } from './recover-with-code.use-case.js';

const OLD_MAC = '00:1a:2b:3c:4d:5f';
const NEW_MAC = '00:1a:2b:3c:4d:60';

class MovableClock extends Clock {
  at = new Date('2026-10-27T10:00:00Z');
  now() {
    return new Date(this.at);
  }
  advance(ms: number) {
    this.at = new Date(this.at.getTime() + ms);
  }
}

/** Hands out the codes it is given, in order; then random ones. */
class ScriptedCodes extends RecoveryCodeGenerator {
  private readonly random = new RandomRecoveryCodeGenerator();
  constructor(public codes: string[] = []) {
    super();
  }
  next() {
    return this.codes.shift() ?? this.random.next();
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

function playlist(id: string, deviceId: string, url: string): Playlist {
  return {
    id,
    deviceId,
    name: id,
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
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
}

describe('recovery (REC-1 to REC-3)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let licenses: InMemoryLicenseRepository;
  let playlists: InMemoryPlaylistRepository;
  let clock: MovableClock;
  let codes: ScriptedCodes;
  let createCode: CreateRecoveryCodeUseCase;
  let recover: RecoverWithCodeUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    licenses = new InMemoryLicenseRepository();
    playlists = new InMemoryPlaylistRepository();
    clock = new MovableClock();
    codes = new ScriptedCodes();
    const devices = devicesForLicensing(trials, paid, undefined, clock);
    const lock = new InProcessLicenseLock();
    const licensedPlaylists = new (class extends LicensedPlaylists {
      moveAll(): never {
        throw new Error('a recovery never moves playlists');
      }
      deleteAll(deviceId: string) {
        return playlists.deleteByDevice(deviceId);
      }
    })();
    createCode = new CreateRecoveryCodeUseCase(licenses, devices, codes, lock, clock);
    recover = new RecoverWithCodeUseCase(licenses, devices, licensedPlaylists, lock, clock);
    await paid.insert(paidDevice({ macAddress: OLD_MAC }));
    await licenses.insert(license());
  });

  const code = async () => {
    const made = await createCode.execute({ deviceId: 'paid-1' });
    if (!made.ok) throw new Error(made.error.code);
    return made.value.code;
  };
  /** The app installed on the new TV: a trial device on that MAC. */
  const newTv = (macAddress = NEW_MAC, id = 'tv-new') =>
    trials.insert(trialDevice({ id, macAddress }));

  describe('REC-1 recovery code', () => {
    it('gives a paid device an 8-character code that lasts 30 minutes', async () => {
      const made = await createCode.execute({ deviceId: 'paid-1' });

      expect(made.ok).toBe(true);
      if (!made.ok) return;
      expect(made.value.code).toMatch(new RegExp(`^[${RECOVERY_CODE_ALPHABET}]{8}$`));
      expect(made.value.expiresAt).toEqual(new Date('2026-10-27T10:30:00Z'));
      expect((await paid.findById('paid-1'))?.recovery).toEqual({
        code: made.value.code,
        expiresAt: made.value.expiresAt,
        enabled: false,
        recoveredFrom: null,
        recoveredAt: null,
      });
    });

    it('replaces the old code with a new one', async () => {
      codes.codes = ['AAAA2222', 'BBBB3333'];
      await code();
      await code();

      expect((await paid.findById('paid-1'))?.recovery?.code).toBe('BBBB3333');
      expect(await paid.findByRecoveryCode('AAAA2222')).toBeNull();
    });

    it('draws again when another device holds the drawn code', async () => {
      await paid.insert(
        paidDevice({
          id: 'paid-2',
          macAddress: '00:1a:2b:3c:4d:70',
          recovery: {
            code: 'TAKEN234',
            expiresAt: null,
            enabled: false,
            recoveredFrom: null,
            recoveredAt: null,
          },
        }),
      );
      codes.codes = ['TAKEN234', 'FREE2345'];

      expect(await code()).toBe('FREE2345');
    });

    it('refuses a trial device', async () => {
      await trials.insert(trialDevice({ id: 'trial-1' }));
      const made = await createCode.execute({ deviceId: 'trial-1' });
      expect(!made.ok && made.error.code).toBe('licensing.recovery_needs_paid_device');
    });

    it('refuses a license that is not running (expired or revoked)', async () => {
      await licenses.update(license({ revoked: true, revokedAt: new Date('2026-10-01') }));
      const made = await createCode.execute({ deviceId: 'paid-1' });
      expect(!made.ok && made.error.code).toBe('licensing.license_not_running');
    });

    it('refuses an unknown device', async () => {
      const made = await createCode.execute({ deviceId: 'nobody' });
      expect(!made.ok && made.error.code).toBe('licensing.device_not_found');
    });
  });

  describe('REC-2 apply the code on a new TV', () => {
    it('gives the paid device the new MAC with the same id, license and playlists', async () => {
      await playlists.insert(playlist('own-1', 'paid-1', 'http://a.example/1.m3u'));
      await newTv();
      const typed = (await code()).toLowerCase();

      const result = await recover.execute({ code: ` ${typed} `, newMac: '00-1A-2B-3C-4D-60' });

      expect(result.ok && result.value).toMatchObject({
        deviceId: 'paid-1',
        from: OLD_MAC,
        to: NEW_MAC,
        removedTrialId: 'tv-new',
      });
      const device = await paid.findById('paid-1');
      expect(device?.macAddress).toBe(NEW_MAC);
      expect(device?.currentLicenseId).toBe('license-1');
      expect(device?.recovery).toEqual({
        code: null,
        expiresAt: null,
        enabled: false,
        recoveredFrom: OLD_MAC,
        recoveredAt: clock.now(),
      });
      expect(device?.switch).toBeNull();
      expect((await playlists.listByDevice('paid-1')).map((p) => p.id)).toEqual(['own-1']);
    });

    it('works once: the same code again is refused', async () => {
      await newTv();
      const typed = await code();
      await recover.execute({ code: typed, newMac: NEW_MAC });
      await newTv('00:1a:2b:3c:4d:61', 'tv-third');

      const again = await recover.execute({ code: typed, newMac: '00:1a:2b:3c:4d:61' });
      expect(!again.ok && again.error.code).toBe('licensing.recovery_code_not_found');
    });

    it('two TVs sending the same code at once: one gets the device', async () => {
      await newTv();
      await newTv('00:1a:2b:3c:4d:61', 'tv-third');
      const typed = await code();

      const results = await Promise.all([
        recover.execute({ code: typed, newMac: NEW_MAC }),
        recover.execute({ code: typed, newMac: '00:1a:2b:3c:4d:61' }),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({
        error: { code: 'licensing.recovery_code_not_found' },
      });
    });

    it('refuses a wrong code, and text that cannot be a code', async () => {
      await newTv();
      await code();
      for (const typed of ['WRONG234', 'abc', '']) {
        const result = await recover.execute({ code: typed, newMac: NEW_MAC });
        expect(!result.ok && result.error.code).toBe('licensing.recovery_code_not_found');
      }
    });

    it('refuses an expired code', async () => {
      await newTv();
      const typed = await code();
      clock.advance(30 * 60 * 1000);

      const result = await recover.execute({ code: typed, newMac: NEW_MAC });
      expect(!result.ok && result.error.code).toBe('licensing.recovery_code_expired');
      expect((await paid.findById('paid-1'))?.macAddress).toBe(OLD_MAC);
    });

    it('refuses when the license stopped running after the code was made', async () => {
      await newTv();
      const typed = await code();
      await licenses.update(license({ revoked: true, revokedAt: clock.now() }));

      const result = await recover.execute({ code: typed, newMac: NEW_MAC });
      expect(!result.ok && result.error.code).toBe('licensing.license_not_running');
    });

    it('refuses a new MAC with no app installed, a paid device on it, the same MAC, a fallback MAC', async () => {
      await paid.insert(paidDevice({ id: 'paid-2', macAddress: '00:1a:2b:3c:4d:70' }));
      const typed = await code();
      const cases: [string, string][] = [
        [NEW_MAC, 'licensing.new_mac_not_registered'],
        ['00:1a:2b:3c:4d:70', 'licensing.mac_taken'],
        [OLD_MAC, 'licensing.same_mac'],
        ['52:54:00:12:34:57', 'licensing.invalid_mac'],
        ['not a mac', 'licensing.invalid_mac'],
      ];
      for (const [newMac, expected] of cases) {
        const result = await recover.execute({ code: typed, newMac });
        expect(!result.ok && result.error.code).toBe(expected);
      }
      // Refusals leave the code usable.
      expect((await paid.findById('paid-1'))?.recovery?.code).toBe(typed);
    });

    it('does not count as a MAC switch', async () => {
      await newTv();
      await recover.execute({ code: await code(), newMac: NEW_MAC });
      expect((await paid.findById('paid-1'))?.switch).toBeNull();
    });
  });

  describe('REC-3 nothing is left behind', () => {
    it("removes the new TV's trial device with its playlists", async () => {
      await newTv();
      await playlists.insert(playlist('tv-1', 'tv-new', 'http://b.example/1.m3u'));
      await playlists.insert(playlist('tv-2', 'tv-new', 'http://b.example/2.m3u'));

      const result = await recover.execute({ code: await code(), newMac: NEW_MAC });

      expect(result.ok && result.value.removedPlaylists).toBe(2);
      expect(await trials.findById('tv-new')).toBeNull();
      expect(await playlists.listByDevice('tv-new')).toEqual([]);
    });

    it('leaves each MAC with exactly one device; the old MAC keeps an ended trial', async () => {
      await newTv();
      await recover.execute({ code: await code(), newMac: NEW_MAC });

      const onNew = [...paid.items.values(), ...trials.items.values()].filter(
        (d) => d.macAddress === NEW_MAC,
      );
      const onOld = [...paid.items.values(), ...trials.items.values()].filter(
        (d) => d.macAddress === OLD_MAC,
      );
      expect(onNew.map((d) => d.id)).toEqual(['paid-1']);
      expect(onOld).toHaveLength(1);
      const left = [...trials.items.values()].find((d) => d.macAddress === OLD_MAC)!;
      expect(left.trialEndsAt.getTime()).toBeLessThan(clock.now().getTime());
      expect(left.playlistCount).toBe(0);
    });
  });

  it('reads a typed code in any case, and refuses what cannot be one', () => {
    expect(normalizeRecoveryCode(' abcd2345 ')).toBe('ABCD2345');
    expect(normalizeRecoveryCode('ABCD234')).toBeNull();
    expect(normalizeRecoveryCode('ABCD2340')).toBeNull(); // 0 is not in the alphabet
  });
});
