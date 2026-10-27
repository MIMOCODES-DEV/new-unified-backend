import { Injectable } from '@nestjs/common';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type {
  DeviceSettingsChange,
  FoundDevice,
  PaidDevice,
  TrialDevice,
} from '../domain/device.js';
import {
  AppDeviceIdInUseError,
  DeviceNotFoundError,
  MacInUseError,
} from '../domain/device.errors.js';
import { DeviceLock } from './ports/device-lock.js';
import { PaidDeviceRepository } from './ports/paid-device.repository.js';
import { TrialDeviceRepository } from './ports/trial-device.repository.js';

/** changeLockedMac found the device on a MAC other than the one locked. */
const MAC_MOVED = Symbol('MAC_MOVED');

/** What paying adds to a device when it moves from trialDevices to devices. */
export interface PaidDeviceFields {
  currentLicenseId: string;
  activatedAt: Date;
  resellerId: string | null;
  customerId: string | null;
}

/**
 * One MAC, one device (task UNQ). A MongoDB index covers one collection, so this class keeps a MAC
 * in only one of trialDevices and devices. Every create, move to devices and MAC change goes
 * through it, holding the lock for the MAC(s) involved and checking both collections.
 * Lookups take no lock: with Redis down, existing devices are still found; only changes wait.
 */
@Injectable()
export class DeviceIdentity {
  constructor(
    private readonly trials: TrialDeviceRepository,
    private readonly paid: PaidDeviceRepository,
    private readonly lock: DeviceLock,
  ) {}

  /** The device with this MAC. devices is read first, so a device caught mid-move counts as paid. */
  async findByMac(mac: MacAddress): Promise<FoundDevice | null> {
    const paid = await this.paid.findByMac(mac);
    if (paid) return { paid: true, device: paid };
    const trial = await this.trials.findByMac(mac);
    return trial ? { paid: false, device: trial } : null;
  }

  /** The device with this id, in whichever collection it is. devices is read first. */
  async findById(id: string): Promise<FoundDevice | null> {
    const paid = await this.paid.findById(id);
    if (paid) return { paid: true, device: paid };
    const trial = await this.trials.findById(id);
    return trial ? { paid: false, device: trial } : null;
  }

  /** The device with this app device id, in whichever collection it is. devices is read first. */
  async findByAppDeviceId(appDeviceId: string): Promise<FoundDevice | null> {
    const paid = await this.paid.findByAppDeviceId(appDeviceId);
    if (paid) return { paid: true, device: paid };
    const trial = await this.trials.findByAppDeviceId(appDeviceId);
    return trial ? { paid: false, device: trial } : null;
  }

  /** The device the old backend knew by this `_id` (`legacy.id`), in whichever collection it is. */
  async findByLegacyId(legacyId: string): Promise<FoundDevice | null> {
    const paid = await this.paid.findByLegacyId(legacyId);
    if (paid) return { paid: true, device: paid };
    const trial = await this.trials.findByLegacyId(legacyId);
    return trial ? { paid: false, device: trial } : null;
  }

  /** A device with this uid (V4 apps), in whichever collection it is. devices is read first. */
  async findByUid(uid: string): Promise<FoundDevice | null> {
    const paid = await this.paid.findByUid(uid);
    if (paid) return { paid: true, device: paid };
    const trial = await this.trials.findByUid(uid);
    return trial ? { paid: false, device: trial } : null;
  }

  /**
   * Saves a new trial device, unless its MAC or app device id already belongs to a device: then
   * that device is returned and nothing is written. Two sign-ups for one MAC at once create one device.
   */
  async claimTrial(device: TrialDevice): Promise<{ created: boolean; found: FoundDevice }> {
    const mac = normalizedMac(device.macAddress);
    return this.lock.withMacs([mac], async () => {
      const existing =
        (await this.findByMac(mac)) ??
        (device.appDeviceId ? await this.findByAppDeviceId(device.appDeviceId) : null);
      if (existing) return { created: false, found: existing };
      await this.trials.insert(device);
      return { created: true, found: { paid: false, device } };
    });
  }

  /**
   * Moves a trial device to devices, keeping its id, MAC and device key: written to devices first,
   * then removed from trialDevices. A move that stopped halfway is finished by calling this again;
   * a device that is already paid is returned unchanged.
   */
  async moveToPaid(
    deviceId: string,
    fields: PaidDeviceFields,
  ): Promise<Result<PaidDevice, DeviceNotFoundError | AppDeviceIdInUseError>> {
    const before = await this.findById(deviceId);
    if (!before) return err(new DeviceNotFoundError('Device not found', { deviceId }));
    const mac = normalizedMac(before.device.macAddress);

    return this.lock.withMacs([mac], async () => {
      const paid = await this.paid.findById(deviceId);
      if (paid) {
        await this.trials.delete(deviceId);
        return ok(paid);
      }
      const trial = await this.trials.findById(deviceId);
      if (!trial) return err(new DeviceNotFoundError('Device not found', { deviceId }));
      // appDeviceId is unique per collection only; a paid device may already hold this one.
      if (trial.appDeviceId && (await this.paid.findByAppDeviceId(trial.appDeviceId))) {
        return err(
          new AppDeviceIdInUseError('This app device id already belongs to a paid device', {
            deviceId,
            appDeviceId: trial.appDeviceId,
          }),
        );
      }

      const moved = toPaidDevice(trial, fields);
      await this.paid.insert(moved);
      await this.trials.delete(deviceId);
      return ok(moved);
    });
  }

  /**
   * Changes owner fields (device key, parent PIN) of a device, wherever it is. Runs under the MAC
   * lock, so a move to devices running at the same time never copies the old values.
   */
  async changeSettings(
    deviceId: string,
    change: DeviceSettingsChange,
  ): Promise<Result<FoundDevice, DeviceNotFoundError>> {
    for (;;) {
      const before = await this.findById(deviceId);
      if (!before) return err(new DeviceNotFoundError('Device not found', { deviceId }));
      const mac = normalizedMac(before.device.macAddress);

      const result = await this.lock.withMacs([mac], async () => {
        const found = await this.findById(deviceId);
        if (!found) return err(new DeviceNotFoundError('Device not found', { deviceId }));
        if (found.device.macAddress !== mac.value) return MAC_MOVED;
        if (found.paid) {
          await this.paid.changeSettings(deviceId, change);
          return ok<FoundDevice>({ paid: true, device: { ...found.device, ...change } });
        }
        await this.trials.changeSettings(deviceId, change);
        return ok<FoundDevice>({ paid: false, device: { ...found.device, ...change } });
      });
      // The MAC changed between the read and the lock: start again under the current one.
      if (result !== MAC_MOVED) return result;
    }
  }

  /**
   * Gives a paid device a new MAC, when no other device has it. `apply` adds whatever else the
   * caller changes (the switch record for a MAC switch, the recovery record for a recovery).
   */
  async changeMac(
    deviceId: string,
    newMac: MacAddress,
    apply: (device: PaidDevice) => PaidDevice,
  ): Promise<Result<PaidDevice, DeviceNotFoundError | MacInUseError>> {
    for (;;) {
      const before = await this.paid.findById(deviceId);
      if (!before) return err(new DeviceNotFoundError('Paid device not found', { deviceId }));
      const oldMac = normalizedMac(before.macAddress);

      const result = await this.lock.withMacs([oldMac, newMac], () =>
        this.changeLockedMac(deviceId, oldMac, newMac, apply),
      );
      // The MAC changed between the read and the lock, so the current one is not locked: start again.
      if (result !== MAC_MOVED) return result;
    }
  }

  private async changeLockedMac(
    deviceId: string,
    oldMac: MacAddress,
    newMac: MacAddress,
    apply: (device: PaidDevice) => PaidDevice,
  ): Promise<Result<PaidDevice, DeviceNotFoundError | MacInUseError> | typeof MAC_MOVED> {
    const device = await this.paid.findById(deviceId);
    if (!device) return err(new DeviceNotFoundError('Paid device not found', { deviceId }));
    if (device.macAddress === newMac.value) return ok(device);
    if (device.macAddress !== oldMac.value) return MAC_MOVED;

    const owner = await this.findByMac(newMac);
    if (owner) {
      return err(
        new MacInUseError('This MAC already belongs to another device', { mac: newMac.value }),
      );
    }
    const updated: PaidDevice = { ...apply(device), id: device.id, macAddress: newMac.value };
    await this.paid.update(updated);
    return ok(updated);
  }
}

/** Same id, MAC and device key; the trial-only fields (trial dates, playlist count) stay behind. */
function toPaidDevice(trial: TrialDevice, fields: PaidDeviceFields): PaidDevice {
  return {
    id: trial.id,
    macAddress: trial.macAddress,
    appDeviceId: trial.appDeviceId,
    platform: trial.platform,
    deviceKey: trial.deviceKey,
    uid: trial.uid,
    stalkerEnabled: trial.stalkerEnabled,
    parentPin: trial.parentPin,
    apiVersion: trial.apiVersion,
    appVersion: trial.appVersion,
    ip: trial.ip,
    lastSeenAt: trial.lastSeenAt,
    legacy: trial.legacy,
    createdAt: trial.createdAt,
    currentLicenseId: fields.currentLicenseId,
    activatedAt: fields.activatedAt,
    resellerId: fields.resellerId,
    customerId: fields.customerId,
    switch: null,
    recovery: null,
    updatedAt: fields.activatedAt,
  };
}

/** Stored MACs are normalized when saved; one that is not is a bug, never user input. */
function normalizedMac(value: string): MacAddress {
  const mac = MacAddress.parse(value);
  if (!mac.ok || mac.value.value !== value) {
    throw new Error(`Device MAC is not normalized: ${value}`);
  }
  return mac.value;
}
