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
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { type ActivateLicenseInput, ActivateLicenseUseCase } from './activate-license.use-case.js';

const now = new Date('2026-10-26T10:00:00Z');
const day = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

describe('ActivateLicenseUseCase (LIC-2)', () => {
  let trials: InMemoryTrialDeviceRepository;
  let paid: InMemoryPaidDeviceRepository;
  let licenses: InMemoryLicenseRepository;
  let activate: ActivateLicenseUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    paid = new InMemoryPaidDeviceRepository();
    licenses = new InMemoryLicenseRepository();
    const devices = devicesForLicensing(trials, paid);
    activate = new ActivateLicenseUseCase(
      licenses,
      devices,
      new InProcessLicenseLock(),
      new FixedClock(now),
    );

    await trials.insert(trialDevice({ trialEndsAt: day('2026-11-02') }));
  });

  const run = async (overrides: Partial<ActivateLicenseInput> = {}) => {
    const result = await activate.execute({
      deviceId: 'trial-1',
      type: 'yearly',
      activatedBy: { source: 'reseller', actorId: 'reseller-7' },
      sourceId: 'tx-1',
      multiActivate: false,
      resellerId: 'reseller-7',
      ...overrides,
    });
    if (!result.ok) throw result.error;
    return result.value;
  };

  it('writes the license row and moves the trial device to devices', async () => {
    const { license, created } = await run();

    expect(created).toBe(true);
    expect(license).toMatchObject({
      deviceId: 'trial-1',
      type: 'yearly',
      expiresAt: day('2027-11-02'),
      revoked: false,
      activatedBy: { source: 'reseller', actorId: 'reseller-7' },
      creditCost: 1,
      multiActivate: false,
      sourceId: 'tx-1',
      createdAt: now,
    });
    expect(trials.items.size).toBe(0);
    expect(paid.items.get('trial-1')).toMatchObject({
      macAddress: '00:1a:2b:3c:4d:5e',
      deviceKey: '123456',
      currentLicenseId: license.id,
      activatedAt: now,
      resellerId: 'reseller-7',
    });
  });

  it('records every source', async () => {
    const sources = [
      'admin',
      'reseller',
      'code',
      'coupon',
      'payment',
      'store',
      'transfer',
      'plan',
    ] as const;
    for (const [i, source] of sources.entries()) {
      await run({ type: 'yearly', activatedBy: { source, actorId: null }, sourceId: `s-${i}` });
    }

    expect([...licenses.items.values()].map((l) => l.activatedBy.source)).toEqual([...sources]);
  });

  it('the same source twice activates once', async () => {
    const first = await run({ sourceId: 'payment-42' });
    const second = await run({ sourceId: 'payment-42' });

    expect(second).toEqual({ license: first.license, created: false });
    expect(licenses.items.size).toBe(1);
  });

  it('two activations at once both count: the second year stacks on the first', async () => {
    const [a, b] = await Promise.all([run({ sourceId: 'a' }), run({ sourceId: 'b' })]);

    const ends = [a.license.expiresAt, b.license.expiresAt].map((d) => d?.toISOString()).sort();
    expect(ends).toEqual([day('2027-11-02').toISOString(), day('2028-11-02').toISOString()]);
    expect(paid.items.get('trial-1')?.currentLicenseId).toBe(
      [a, b].find((r) => r.license.expiresAt?.getTime() === day('2028-11-02').getTime())?.license
        .id,
    );
  });

  it('a paid device keeps its activation date and points at the new license', async () => {
    const first = await run({ sourceId: 'a' });
    const second = await run({ sourceId: 'b', type: 'lifetime', resellerId: null });

    expect(second.license).toMatchObject({ type: 'lifetime', expiresAt: null, creditCost: 2 });
    expect(paid.items.get('trial-1')).toMatchObject({
      currentLicenseId: second.license.id,
      activatedAt: now,
      resellerId: 'reseller-7',
    });
    expect(licenses.items.has(first.license.id)).toBe(true);
  });

  it('refuses a year on a running lifetime and writes nothing', async () => {
    await run({ sourceId: 'a', type: 'lifetime' });

    const result = await activate.execute({
      deviceId: 'trial-1',
      type: 'yearly',
      activatedBy: { source: 'admin', actorId: null },
      sourceId: 'b',
      multiActivate: false,
    });

    expect(!result.ok && result.error.code).toBe('licensing.already_lifetime');
    expect(licenses.items.size).toBe(1);
  });

  it('stores multiActivate', async () => {
    expect((await run({ multiActivate: true })).license.multiActivate).toBe(true);
  });

  it('refuses an unknown device', async () => {
    const result = await activate.execute({
      deviceId: 'nobody',
      type: 'yearly',
      activatedBy: { source: 'admin', actorId: null },
      sourceId: null,
      multiActivate: false,
    });

    expect(!result.ok && result.error.code).toBe('licensing.device_not_found');
    expect(licenses.items.size).toBe(0);
  });

  it('undoes the license row when the device cannot move', async () => {
    await paid.insert(paidDevice({ id: 'other', appDeviceId: 'app-x' }));
    await trials.insert(
      trialDevice({ id: 'trial-2', macAddress: '00:1a:2b:3c:4d:77', appDeviceId: 'app-x' }),
    );

    const result = await activate.execute({
      deviceId: 'trial-2',
      type: 'yearly',
      activatedBy: { source: 'admin', actorId: null },
      sourceId: 'x',
      multiActivate: false,
    });

    expect(!result.ok && result.error.code).toBe('licensing.device_conflict');
    expect(licenses.items.size).toBe(0);
    expect(trials.items.has('trial-2')).toBe(true);
  });
});
