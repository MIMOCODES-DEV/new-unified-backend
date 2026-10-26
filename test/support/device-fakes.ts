import { CaptchaImage } from '../../src/modules/devices/application/ports/captcha-image.js';
import type { CaptchaRepository } from '../../src/modules/devices/application/ports/captcha.repository.js';
import type { DeviceLock } from '../../src/modules/devices/application/ports/device-lock.js';
import type { Captcha, CaptchaKind } from '../../src/modules/devices/domain/captcha.js';
import type { PaidDeviceRepository } from '../../src/modules/devices/application/ports/paid-device.repository.js';
import type { TrialDeviceRepository } from '../../src/modules/devices/application/ports/trial-device.repository.js';
import type {
  DeviceSettingsChange,
  DeviceVisit,
  PaidDevice,
  TrialDevice,
} from '../../src/modules/devices/domain/device.js';
import type { MacAddress } from '../../src/shared/kernel/mac-address.js';

const at = new Date('2026-10-25T10:00:00Z');

/** A valid trial device; override what the test cares about. */
export function trialDevice(overrides: Partial<TrialDevice> = {}): TrialDevice {
  return {
    id: 'trial-1',
    macAddress: '00:1a:2b:3c:4d:5e',
    appDeviceId: null,
    platform: 'samsung',
    deviceKey: '123456',
    uid: null,
    stalkerEnabled: false,
    parentPin: '0000',
    apiVersion: 'legacy',
    appVersion: '1.1.6',
    ip: '203.0.113.7',
    lastSeenAt: at,
    legacy: null,
    createdAt: at,
    updatedAt: at,
    trialStartedAt: at,
    trialEndsAt: new Date('2026-11-01T23:59:59.999Z'),
    playlistCount: 0,
    firstPlaylistAt: null,
    ...overrides,
  };
}

/** A valid paid device; override what the test cares about. */
export function paidDevice(overrides: Partial<PaidDevice> = {}): PaidDevice {
  return {
    id: 'paid-1',
    macAddress: '00:1a:2b:3c:4d:5f',
    appDeviceId: null,
    platform: 'lg',
    deviceKey: '654321',
    uid: null,
    stalkerEnabled: false,
    parentPin: '0000',
    apiVersion: 'legacy',
    appVersion: '1.0.7',
    ip: '203.0.113.8',
    lastSeenAt: at,
    legacy: null,
    createdAt: at,
    updatedAt: at,
    currentLicenseId: 'license-1',
    activatedAt: at,
    resellerId: null,
    customerId: null,
    switch: null,
    recovery: null,
    ...overrides,
  };
}

/** Yields to other promises, so "parallel" calls really interleave like they would against a database. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export class InMemoryTrialDeviceRepository implements TrialDeviceRepository {
  readonly items = new Map<string, TrialDevice>();

  private async find(match: (d: TrialDevice) => boolean): Promise<TrialDevice | null> {
    await tick();
    return [...this.items.values()].find(match) ?? null;
  }

  findById(id: string) {
    return this.find((d) => d.id === id);
  }
  findByMac(mac: MacAddress) {
    return this.find((d) => d.macAddress === mac.value);
  }
  findByAppDeviceId(appDeviceId: string) {
    return this.find((d) => d.appDeviceId === appDeviceId);
  }
  findByUid(uid: string) {
    return this.find((d) => d.uid === uid);
  }
  findByLegacyId(legacyId: string) {
    return this.find((d) => d.legacy?.id === legacyId);
  }
  async insert(device: TrialDevice): Promise<void> {
    await tick();
    // Same rule as the unique index on trialDevices.macAddress.
    if ([...this.items.values()].some((d) => d.macAddress === device.macAddress)) {
      throw new Error('E11000 duplicate key: trialDevices.macAddress');
    }
    if (
      device.appDeviceId &&
      [...this.items.values()].some((d) => d.appDeviceId === device.appDeviceId)
    ) {
      throw new Error('E11000 duplicate key: trialDevices.appDeviceId');
    }
    this.items.set(device.id, device);
  }
  async recordVisit(id: string, visit: DeviceVisit): Promise<boolean> {
    await tick();
    const device = this.items.get(id);
    if (!device) return false;
    const { at, ...rest } = visit;
    this.items.set(id, { ...device, ...rest, lastSeenAt: at, updatedAt: at });
    return true;
  }
  async changeSettings(id: string, change: DeviceSettingsChange): Promise<boolean> {
    await tick();
    const device = this.items.get(id);
    if (!device) return false;
    this.items.set(id, { ...device, ...change });
    return true;
  }
  async update(device: TrialDevice): Promise<boolean> {
    await tick();
    if (!this.items.has(device.id)) return false;
    this.items.set(device.id, device);
    return true;
  }
  async delete(id: string): Promise<boolean> {
    await tick();
    return this.items.delete(id);
  }
}

export class InMemoryPaidDeviceRepository implements PaidDeviceRepository {
  readonly items = new Map<string, PaidDevice>();

  private async find(match: (d: PaidDevice) => boolean): Promise<PaidDevice | null> {
    await tick();
    return [...this.items.values()].find(match) ?? null;
  }

  findById(id: string) {
    return this.find((d) => d.id === id);
  }
  findByMac(mac: MacAddress) {
    return this.find((d) => d.macAddress === mac.value);
  }
  findByAppDeviceId(appDeviceId: string) {
    return this.find((d) => d.appDeviceId === appDeviceId);
  }
  findByUid(uid: string) {
    return this.find((d) => d.uid === uid);
  }
  findByLegacyId(legacyId: string) {
    return this.find((d) => d.legacy?.id === legacyId);
  }
  async insert(device: PaidDevice): Promise<void> {
    await tick();
    if ([...this.items.values()].some((d) => d.macAddress === device.macAddress)) {
      throw new Error('E11000 duplicate key: devices.macAddress');
    }
    if (
      device.appDeviceId &&
      [...this.items.values()].some((d) => d.appDeviceId === device.appDeviceId)
    ) {
      throw new Error('E11000 duplicate key: devices.appDeviceId');
    }
    this.items.set(device.id, device);
  }
  async recordVisit(id: string, visit: DeviceVisit): Promise<boolean> {
    await tick();
    const device = this.items.get(id);
    if (!device) return false;
    const { at, ...rest } = visit;
    this.items.set(id, { ...device, ...rest, lastSeenAt: at, updatedAt: at });
    return true;
  }
  async changeSettings(id: string, change: DeviceSettingsChange): Promise<boolean> {
    await tick();
    const device = this.items.get(id);
    if (!device) return false;
    this.items.set(id, { ...device, ...change });
    return true;
  }
  async update(device: PaidDevice): Promise<boolean> {
    await tick();
    if (!this.items.has(device.id)) return false;
    this.items.set(device.id, device);
    return true;
  }
}

/** One lock per MAC inside this process: what RedisDeviceLock does across servers. */
export class InProcessDeviceLock implements DeviceLock {
  private readonly tails = new Map<string, Promise<unknown>>();
  /** Set to make every lock fail, like Redis being down. */
  unavailable = false;

  withMacs<T>(macs: readonly MacAddress[], fn: () => Promise<T>): Promise<T> {
    if (this.unavailable) return Promise.reject(new Error('Redis is unavailable'));
    const keys = [...new Set(macs.map((m) => m.value))].sort();
    const run = (i: number): Promise<T> =>
      i === keys.length ? fn() : this.one(keys[i]!, () => run(i + 1));
    return run(0);
  }

  private one<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const before = this.tails.get(key) ?? Promise.resolve();
    const result = before.then(fn, fn);
    this.tails.set(
      key,
      result.catch(() => undefined),
    );
    return result;
  }
}

export class InMemoryCaptchaRepository implements CaptchaRepository {
  readonly items = new Map<string, Captcha>();

  async findByToken(token: string): Promise<Captcha | null> {
    await tick();
    return [...this.items.values()].find((c) => c.token === token) ?? null;
  }
  async findSolved(mac: MacAddress, kind: CaptchaKind): Promise<Captcha | null> {
    await tick();
    const solved = [...this.items.values()]
      .filter((c) => c.macAddress === mac.value && c.kind === kind && c.verifiedAt !== null)
      .sort((a, b) => b.verifiedAt!.getTime() - a.verifiedAt!.getTime());
    return solved[0] ?? null;
  }
  async findOpen(mac: MacAddress, kind: CaptchaKind, now: Date): Promise<Captcha | null> {
    await tick();
    const open = [...this.items.values()]
      .filter(
        (c) =>
          c.macAddress === mac.value &&
          c.kind === kind &&
          c.verifiedAt === null &&
          c.expiresAt !== null &&
          c.expiresAt > now,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return open[0] ?? null;
  }
  async insert(captcha: Captcha): Promise<void> {
    await tick();
    this.items.set(captcha.id, captcha);
  }
  async update(captcha: Captcha): Promise<boolean> {
    await tick();
    if (!this.items.has(captcha.id)) return false;
    this.items.set(captcha.id, captcha);
    return true;
  }
  async markSolved(id: string, at: Date): Promise<boolean> {
    await tick();
    const captcha = this.items.get(id);
    if (!captcha || captcha.verifiedAt !== null) return false;
    this.items.set(id, { ...captcha, verifiedAt: at, expiresAt: null });
    return true;
  }
  async delete(id: string): Promise<boolean> {
    await tick();
    return this.items.delete(id);
  }
}

/** Draws nothing: the text is fixed (or given), and the SVG is a marker the test can read. */
export class FakeCaptchaImage extends CaptchaImage {
  constructor(public text = 'AB7K') {
    super();
  }
  random(length: number): { text: string; svg: string } {
    const text = this.text.slice(0, length);
    return { text, svg: `<svg>${text}</svg>` };
  }
  draw(text: string): string {
    return `<svg>${text}</svg>`;
  }
}
