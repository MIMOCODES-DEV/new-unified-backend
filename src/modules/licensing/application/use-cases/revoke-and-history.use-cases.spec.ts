import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryPaidDeviceRepository,
  InMemoryTrialDeviceRepository,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import {
  devicesForLicensing,
  InMemoryLicenseRepository,
  InProcessLicenseLock,
} from '../../../../../test/support/license-fakes.js';
import { Clock } from '../../../../shared/kernel/clock.js';
import { ActivateLicenseUseCase } from './activate-license.use-case.js';
import { DeviceLicenseUseCase } from './device-license.use-case.js';
import { LicenseHistoryUseCase } from './license-history.use-case.js';
import { RevokeLicenseUseCase } from './revoke-license.use-case.js';

const day = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

class MovableClock extends Clock {
  at = new Date('2026-10-26T10:00:00Z');
  now() {
    return new Date(this.at);
  }
}

describe('Revoke, expiry and history (LIC-3)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let licenses: InMemoryLicenseRepository;
  let clock: MovableClock;
  let activate: ActivateLicenseUseCase;
  let revoke: RevokeLicenseUseCase;
  let state: DeviceLicenseUseCase;
  let history: LicenseHistoryUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    licenses = new InMemoryLicenseRepository();
    clock = new MovableClock();
    const devices = devicesForLicensing(trials, paid);
    const lock = new InProcessLicenseLock();
    activate = new ActivateLicenseUseCase(licenses, devices, lock, clock);
    revoke = new RevokeLicenseUseCase(licenses, devices, lock, clock);
    state = new DeviceLicenseUseCase(licenses, devices, clock);
    history = new LicenseHistoryUseCase(licenses, devices, clock);
    await trials.insert(trialDevice({ trialEndsAt: day('2026-11-02') }));
  });

  const pay = async (type: 'yearly' | 'lifetime', sourceId: string, actorId = 'reseller-7') => {
    const result = await activate.execute({
      deviceId: 'trial-1',
      type,
      activatedBy: { source: 'reseller', actorId },
      sourceId,
      multiActivate: false,
    });
    if (!result.ok) throw result.error;
    return result.value.license;
  };
  const now = async () => {
    const result = await state.execute('trial-1');
    if (!result.ok) throw result.error;
    return result.value;
  };

  describe('state, worked out at each call', () => {
    it('a trial device is in trial until its trial ends, then expired', async () => {
      expect(await now()).toMatchObject({
        state: 'trial',
        active: true,
        endsAt: day('2026-11-02'),
        license: null,
      });

      clock.at = new Date('2026-11-03T00:00:00Z');

      expect(await now()).toMatchObject({ state: 'expired', active: false });
    });

    it('a yearly license runs until its end, then is expired; nothing is written for it', async () => {
      await pay('yearly', 'tx-1');
      expect(await now()).toMatchObject({
        state: 'yearly',
        active: true,
        endsAt: day('2027-11-02'),
      });
      const before = [...licenses.items.values()];

      clock.at = new Date('2027-11-03T00:00:00Z');

      expect(await now()).toMatchObject({ state: 'expired', active: false });
      expect([...licenses.items.values()]).toEqual(before);
    });

    it('lifetime never expires', async () => {
      await pay('lifetime', 'tx-1');
      clock.at = new Date('2099-01-01T00:00:00Z');

      expect(await now()).toMatchObject({ state: 'lifetime', active: true, endsAt: null });
    });
  });

  describe('revoke', () => {
    it('keeps the row with revoked and revokedAt; the device stays paid with no valid license', async () => {
      const license = await pay('yearly', 'tx-1');
      clock.at = new Date('2026-12-01T09:00:00Z');

      const result = await revoke.execute({ deviceId: 'trial-1' });

      expect(result.ok && result.value).toMatchObject({
        id: license.id,
        revoked: true,
        revokedAt: clock.at,
      });
      expect(licenses.items.get(license.id)?.revoked).toBe(true);
      expect(paid.items.get('trial-1')?.currentLicenseId).toBe(license.id);
      expect(trials.items.size).toBe(0);
      expect(await now()).toMatchObject({ state: 'revoked', active: false });
    });

    it('a revoked device can pay again; the new year starts today', async () => {
      await pay('yearly', 'tx-1');
      clock.at = new Date('2026-12-01T09:00:00Z');
      await revoke.execute({ deviceId: 'trial-1' });

      await pay('yearly', 'tx-2');

      expect(await now()).toMatchObject({ state: 'yearly', endsAt: day('2027-12-01') });
    });

    it('refuses to revoke twice, and a trial device that has no license', async () => {
      const onTrial = await revoke.execute({ deviceId: 'trial-1' });
      await pay('yearly', 'tx-1');
      await revoke.execute({ deviceId: 'trial-1' });
      const twice = await revoke.execute({ deviceId: 'trial-1' });

      expect(!onTrial.ok && onTrial.error.code).toBe('licensing.no_license');
      expect(!twice.ok && twice.error.code).toBe('licensing.already_revoked');
    });

    it('refuses an unknown device', async () => {
      const result = await revoke.execute({ deviceId: 'nobody' });

      expect(!result.ok && result.error.code).toBe('licensing.device_not_found');
    });
  });

  describe('history', () => {
    it('lists every license, oldest first, with who activated it and which is current', async () => {
      const first = await pay('yearly', 'tx-1', 'reseller-7');
      clock.at = new Date('2026-12-01T09:00:00Z');
      await revoke.execute({ deviceId: 'trial-1' });
      const second = await pay('lifetime', 'tx-2', 'reseller-9');

      const result = await history.execute('trial-1');

      expect(
        result.ok &&
          result.value.map((e) => [
            e.license.id,
            e.license.activatedBy.actorId,
            e.state,
            e.current,
          ]),
      ).toEqual([
        [first.id, 'reseller-7', 'revoked', false],
        [second.id, 'reseller-9', 'lifetime', true],
      ]);
    });

    it('is empty for a trial device', async () => {
      expect(await history.execute('trial-1')).toEqual({ ok: true, value: [] });
    });
  });
});
