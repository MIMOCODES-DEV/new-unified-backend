import { beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryDeviceRepository,
  InMemoryDeviceSettings,
  SequenceMacGenerator,
  SequenceKeyGenerator,
} from '../../../../../test/support/in-memory-device.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { AppType } from '../../domain/app-type.js';
import { Device } from '../../domain/device.entity.js';
import { TrialDays } from '../../domain/trial-days.js';
import { RegisterOrGetDeviceUseCase } from './register-or-get-device.use-case.js';

const NOW = new Date('2026-10-19T10:00:00Z');

function mac(input: string): MacAddress {
  const r = MacAddress.parse(input);
  if (!r.ok) throw r.error;
  return r.value;
}

function trialDevice(id: string, macAddress: string, deviceKey: string): Device {
  const app = AppType.parse('samsung');
  if (!app.ok) throw app.error;
  return Device.registerTrial({
    id,
    macAddress: mac(macAddress),
    appType: app.value,
    deviceKey,
    now: NOW,
  });
}

function paidDevice(id: string, macAddress: string, deviceKey: string): Device {
  const device = trialDevice(id, macAddress, deviceKey);
  device.activate(NOW);
  return device;
}

describe('RegisterOrGetDeviceUseCase', () => {
  let repo: InMemoryDeviceRepository;
  let clock: FixedClock;
  let useCase: RegisterOrGetDeviceUseCase;
  let settings: InMemoryDeviceSettings;

  beforeEach(() => {
    repo = new InMemoryDeviceRepository();
    settings = new InMemoryDeviceSettings();
    clock = new FixedClock(NOW);
    useCase = new RegisterOrGetDeviceUseCase(
      repo,
      new SequenceKeyGenerator(['111111', '222222', '333333']),
      clock,
      settings,
      new SequenceMacGenerator(['02:00:00:00:00:01', '02:00:00:00:00:02', '02:00:00:00:00:03']),
    );
  });

  it('creates a trial device in pendingDevices', async () => {
    const result = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!result.ok) throw result.error;
    expect(result.value.outcome).toBe('created');
    expect(result.value.device.state).toBe('pending');
    expect(result.value.device.deviceKey).toBe('111111');
    expect(result.value.device.trialExpiresAt).toEqual(new Date('2026-10-26T10:00:00Z'));
    expect(repo.pending.size).toBe(1);
    expect(repo.paid.size).toBe(0);
  });

  it("uses the brand's trial length", async () => {
    const days = TrialDays.parse(14);
    if (!days.ok) throw days.error;
    await settings.setTrialDays(days.value);

    const result = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!result.ok) throw result.error;
    expect(result.value.device.trialExpiresAt).toEqual(new Date('2026-11-02T10:00:00Z'));
  });

  it('finds the same device for any MAC spelling', async () => {
    const first = await useCase.execute({ macAddress: 'AA-BB-CC-DD-EE-01', appType: 'samsung' });
    const second = await useCase.execute({ macAddress: 'aabb.ccdd.ee01', appType: 'samsung' });
    const third = await useCase.execute({ macAddress: 'aabbccddee01', appType: 'samsung' });

    if (!first.ok || !second.ok || !third.ok) throw new Error('expected ok');
    expect(second.value.outcome).toBe('existing');
    expect(third.value.outcome).toBe('existing');
    expect(second.value.device.id).toBe(first.value.device.id);
    expect(third.value.device.id).toBe(first.value.device.id);
    expect(repo.pending.size).toBe(1);
  });

  it('returns the paid device before looking in pending', async () => {
    repo.paid.set('p1', paidDevice('p1', 'AA:BB:CC:DD:EE:01', '444444'));

    const result = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!result.ok) throw result.error;
    expect(result.value.outcome).toBe('existing');
    expect(result.value.device.isPaid).toBe(true);
    expect(repo.pending.size).toBe(0);
  });

  it('returns an expired trial unchanged and never starts a new one', async () => {
    const first = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });
    const returnAt = new Date('2026-11-01T00:00:00Z');
    clock = new FixedClock(returnAt);
    useCase = new RegisterOrGetDeviceUseCase(
      repo,
      new SequenceKeyGenerator(['999999']),
      clock,
      settings,
      new SequenceMacGenerator(['02:00:00:00:00:01', '02:00:00:00:00:02', '02:00:00:00:00:03']),
    );

    const again = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!first.ok || !again.ok) throw new Error('expected ok');
    expect(again.value.outcome).toBe('existing');
    expect(again.value.device.id).toBe(first.value.device.id);
    expect(again.value.device.deviceKey).toBe('111111');
    expect(again.value.device.trialExpiresAt).toEqual(new Date('2026-10-26T10:00:00Z'));
    expect(again.value.device.isTrialExpired(returnAt)).toBe(true);
    expect(again.value.device.lastSeenAt).toEqual(returnAt);
  });

  it('returns the winner when it loses a creation race', async () => {
    repo.beforeNextWrite = () => {
      repo.pending.set('winner', trialDevice('winner', 'AA:BB:CC:DD:EE:01', '555555'));
    };

    const result = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!result.ok) throw result.error;
    expect(result.value.device.id).toBe('winner');
    expect(result.value.outcome).toBe('existing');
    expect(repo.pending.size).toBe(1);
  });

  it('returns the paid device when it was activated between the two lookups', async () => {
    // Pending lookup misses, then an activation lands the device in devices before we insert.
    repo.afterNextPendingLookup = () => {
      repo.paid.set('paid1', paidDevice('paid1', 'AA:BB:CC:DD:EE:01', '444444'));
    };

    const result = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!result.ok) throw result.error;
    expect(result.value.outcome).toBe('existing');
    expect(result.value.device.id).toBe('paid1');
    expect(repo.pending.size).toBe(0);
  });

  it('returns the winner even if it was activated right after winning the race', async () => {
    const winner = trialDevice('winner', 'AA:BB:CC:DD:EE:01', '555555');
    repo.beforeNextWrite = () => repo.pending.set(winner.id, winner);
    repo.afterNextInsert = () => {
      repo.pending.delete(winner.id);
      winner.activate(NOW);
      repo.paid.set(winner.id, winner);
    };

    const result = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!result.ok) throw result.error;
    expect(result.value.device.id).toBe('winner');
    expect(result.value.device.isPaid).toBe(true);
    expect(result.value.outcome).toBe('existing');
  });

  it('skips a key already used by a paid device', async () => {
    repo.paid.set('p1', paidDevice('p1', 'AA:BB:CC:DD:EE:99', '111111'));

    const result = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' });

    if (!result.ok) throw result.error;
    expect(result.value.device.deviceKey).toBe('222222');
  });

  it('fails after 5 key collisions', async () => {
    repo.paid.set('p1', paidDevice('p1', 'AA:BB:CC:DD:EE:99', '111111'));
    useCase = new RegisterOrGetDeviceUseCase(
      repo,
      new SequenceKeyGenerator(['111111']),
      clock,
      settings,
      new SequenceMacGenerator(['02:00:00:00:00:01', '02:00:00:00:00:02', '02:00:00:00:00:03']),
    );

    await expect(
      useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'samsung' }),
    ).rejects.toThrow('unique device key');
  });

  it('rejects an invalid MAC or app type without saving', async () => {
    const badMac = await useCase.execute({ macAddress: 'nope', appType: 'samsung' });
    const badApp = await useCase.execute({ macAddress: 'AA:BB:CC:DD:EE:01', appType: 'lg tv' });

    expect(!badMac.ok && badMac.error.code).toBe('kernel.invalid_mac_address');
    expect(!badApp.ok && badApp.error.code).toBe('devices.invalid_app_type');
    expect(repo.pending.size).toBe(0);
    expect(repo.paid.size).toBe(0);
  });

  describe('devices without a usable MAC (DEV-10)', () => {
    it('identifies a device without a MAC by its app_device_id and gives it its own random MAC', async () => {
      const result = await useCase.execute({ appDeviceId: 'tv-install-1', appType: 'vidaa' });

      if (!result.ok) throw result.error;
      expect(result.value.outcome).toBe('created');
      expect(result.value.device.macAddress.value).toBe('02:00:00:00:00:01');
      expect(result.value.device.appDeviceId?.value).toBe('tv-install-1');
    });

    it('finds the same device again by its app_device_id', async () => {
      const first = await useCase.execute({ appDeviceId: 'tv-install-1', appType: 'vidaa' });
      const again = await useCase.execute({
        macAddress: '',
        appDeviceId: 'tv-install-1',
        appType: 'vidaa',
      });

      if (!first.ok || !again.ok) throw new Error('expected ok');
      expect(again.value.outcome).toBe('existing');
      expect(again.value.device.id).toBe(first.value.device.id);
      expect(repo.pending.size).toBe(1);
    });

    it('never merges two installs that report the same shared fallback MAC', async () => {
      const a = await useCase.execute({
        macAddress: '52:54:00:12:34:57',
        appDeviceId: 'bob-a',
        appType: 'android',
      });
      const b = await useCase.execute({
        macAddress: '52:54:00:12:34:57',
        appDeviceId: 'bob-b',
        appType: 'android',
      });

      if (!a.ok || !b.ok) throw new Error('expected ok');
      expect(a.value.device.id).not.toBe(b.value.device.id);
      expect(a.value.device.macAddress.value).not.toBe('52:54:00:12:34:57');
      expect(repo.pending.size).toBe(2);
    });

    it('requires an app_device_id when there is no usable MAC', async () => {
      const none = await useCase.execute({ appType: 'vidaa' });
      const shared = await useCase.execute({ macAddress: '52:54:00:12:34:59', appType: 'android' });
      const bad = await useCase.execute({ appDeviceId: '  ', appType: 'vidaa' });

      expect(!none.ok && none.error.code).toBe('devices.identity_required');
      expect(!shared.ok && shared.error.code).toBe('devices.identity_required');
      expect(!bad.ok && bad.error.code).toBe('devices.identity_required');
      expect(repo.pending.size).toBe(0);
    });

    it('draws another random MAC if the first one is already used', async () => {
      repo.pending.set('x', trialDevice('x', '02:00:00:00:00:01', '999999'));

      const result = await useCase.execute({ appDeviceId: 'tv-install-2', appType: 'vidaa' });

      expect(result.ok && result.value.device.macAddress.value).toBe('02:00:00:00:00:02');
    });

    it('a device with a normal MAC is identified by MAC only: the same app_device_id on another MAC is another device', async () => {
      // e.g. an Android box that moves from ethernet to Wi-Fi, or cloned firmware sharing an id
      const ethernet = await useCase.execute({
        macAddress: 'AA:BB:CC:DD:EE:01',
        appDeviceId: 'phone-9',
        appType: 'android',
      });
      const wifi = await useCase.execute({
        macAddress: 'AA:BB:CC:DD:EE:02',
        appDeviceId: 'phone-9',
        appType: 'android',
      });

      expect(ethernet.ok && wifi.ok).toBe(true);
      if (!ethernet.ok || !wifi.ok) return;
      expect(wifi.value.outcome).toBe('created');
      expect(wifi.value.device.id).not.toBe(ethernet.value.device.id);
    });

    it('a device first seen without a MAC can later report a real MAC with the same app_device_id', async () => {
      await useCase.execute({ appDeviceId: 'tv-install-3', appType: 'vidaa' });

      const later = await useCase.execute({
        macAddress: 'AA:BB:CC:DD:EE:03',
        appDeviceId: 'tv-install-3',
        appType: 'vidaa',
      });

      expect(later.ok && later.value.outcome).toBe('created');
    });
  });
});
