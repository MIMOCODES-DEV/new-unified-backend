import {
  CaptchaImages,
  type CaptchaPurpose,
  CaptchaStore,
} from '../../src/modules/devices/application/ports/captcha.js';
import { DeviceKeyGenerator } from '../../src/modules/devices/application/ports/device-key.generator.js';
import { RandomMacGenerator } from '../../src/modules/devices/application/ports/random-mac.generator.js';
import { DeviceSettings } from '../../src/modules/devices/application/ports/device-settings.js';
import {
  DeviceRepository,
  type InsertResult,
  type MoveResult,
} from '../../src/modules/devices/application/ports/device.repository.js';
import type { AppDeviceId } from '../../src/modules/devices/domain/device-identity.js';
import type { Device } from '../../src/modules/devices/domain/device.entity.js';
import type { LegacyProfile } from '../../src/modules/devices/domain/legacy-profile.js';
import { TrialDays } from '../../src/modules/devices/domain/trial-days.js';
import { MacAddress } from '../../src/shared/kernel/mac-address.js';

/** Keeps devices in two maps and enforces the same uniqueness rules as the MongoDB adapter. */
export class InMemoryDeviceRepository extends DeviceRepository {
  readonly pending = new Map<string, Device>();
  readonly paid = new Map<string, Device>();
  /** Runs once at the start of the next insertPending/moveToPaid, to simulate a competing request. */
  beforeNextWrite?: () => void;
  /** Runs once right after the next findPendingByMac has read its answer (the answer is unchanged). */
  afterNextPendingLookup?: () => void;
  /** Runs once right after the next insertPending has decided its result. */
  afterNextInsert?: () => void;

  findPaidByMac(mac: MacAddress): Promise<Device | null> {
    return Promise.resolve(this.byMac(this.paid, mac));
  }

  findPaidByAppDeviceId(id: AppDeviceId): Promise<Device | null> {
    return Promise.resolve(this.byAppDeviceId(this.paid, id));
  }

  findPendingByAppDeviceId(id: AppDeviceId): Promise<Device | null> {
    return Promise.resolve(this.byAppDeviceId(this.pending, id));
  }

  findPendingByMac(mac: MacAddress): Promise<Device | null> {
    const found = this.byMac(this.pending, mac);
    this.runOnce('afterNextPendingLookup');
    return Promise.resolve(found);
  }

  insertPending(device: Device): Promise<InsertResult> {
    this.runBeforeWrite();
    const result = this.tryInsert(device);
    this.runOnce('afterNextInsert');
    return Promise.resolve(result);
  }

  private tryInsert(device: Device): InsertResult {
    if (this.byMac(this.pending, device.macAddress)) return 'mac_taken';
    if (device.appDeviceId && this.byAppDeviceId(this.pending, device.appDeviceId)) {
      return 'app_device_id_taken';
    }
    const keys = [...this.pending.values(), ...this.paid.values()].map((d) => d.deviceKey);
    if (keys.includes(device.deviceKey)) return 'key_taken';
    this.pending.set(device.id, device);
    return 'inserted';
  }

  private runOnce(name: 'afterNextPendingLookup' | 'afterNextInsert'): void {
    const hook = this[name];
    this[name] = undefined;
    hook?.();
  }

  touch(): Promise<void> {
    // Devices are stored by reference; the visit is already on the object.
    return Promise.resolve();
  }

  moveToPaid(device: Device): Promise<MoveResult> {
    this.runBeforeWrite();
    if (!this.pending.has(device.id) || this.byMac(this.paid, device.macAddress)) {
      return Promise.resolve('not_pending');
    }
    this.pending.delete(device.id);
    this.paid.set(device.id, device);
    return Promise.resolve('moved');
  }

  private byAppDeviceId(map: Map<string, Device>, id: AppDeviceId): Device | null {
    return [...map.values()].find((d) => d.appDeviceId?.equals(id)) ?? null;
  }

  private byMac(map: Map<string, Device>, mac: MacAddress): Device | null {
    return [...map.values()].find((d) => d.macAddress.equals(mac)) ?? null;
  }

  private runBeforeWrite(): void {
    const hook = this.beforeNextWrite;
    this.beforeNextWrite = undefined;
    hook?.();
  }
}

/** Hands out the given keys in order, repeating the last one when they run out. */
export class SequenceKeyGenerator extends DeviceKeyGenerator {
  private index = 0;

  constructor(private readonly keys: string[]) {
    super();
  }

  next(): string {
    const key = this.keys[Math.min(this.index, this.keys.length - 1)] ?? '000000';
    this.index++;
    return key;
  }
}

/** Per-brand device settings held in memory; starts at the default trial length. */
export class InMemoryDeviceSettings extends DeviceSettings {
  constructor(private days: TrialDays = TrialDays.default()) {
    super();
  }

  trialDays(): Promise<TrialDays> {
    return Promise.resolve(this.days);
  }

  setTrialDays(days: TrialDays): Promise<void> {
    this.days = days;
    return Promise.resolve();
  }

  profile: LegacyProfile = 'cr';

  legacyProfile(): Promise<LegacyProfile> {
    return Promise.resolve(this.profile);
  }

  setLegacyProfile(profile: LegacyProfile): Promise<void> {
    this.profile = profile;
    return Promise.resolve();
  }
}

interface StoredCaptcha {
  purpose: CaptchaPurpose;
  mac: string;
  token: string;
  text: string;
}

/** Captchas in memory; tokens are predictable (`tok-1`, `tok-2`…) so tests can answer them. */
export class InMemoryCaptchaStore extends CaptchaStore {
  readonly items: StoredCaptcha[] = [];
  private counter = 0;

  create(input: { purpose: CaptchaPurpose; mac: MacAddress; text: string }): Promise<string> {
    const token = `tok-${++this.counter}`;
    const keep = this.items.filter(
      (c) => !(c.purpose === input.purpose && c.mac === input.mac.value),
    );
    this.items.splice(0, this.items.length, ...keep, {
      purpose: input.purpose,
      mac: input.mac.value,
      token,
      text: input.text,
    });
    return Promise.resolve(token);
  }

  consume(input: {
    purpose: CaptchaPurpose;
    mac: MacAddress;
    token: string;
    answer: string;
  }): Promise<boolean> {
    const index = this.items.findIndex(
      (c) =>
        c.purpose === input.purpose &&
        c.mac === input.mac.value &&
        c.token === input.token &&
        c.text.toUpperCase() === input.answer.trim().toUpperCase(),
    );
    if (index < 0) return Promise.resolve(false);
    this.items.splice(index, 1);
    return Promise.resolve(true);
  }
}

/** Fixed captcha images: the registration answer is always `ABCD`. */
export class FakeCaptchaImages extends CaptchaImages {
  registration(): { text: string; svg: string } {
    return { text: 'ABCD', svg: '<svg>ABCD</svg>' };
  }

  uidRecovery(uid: string): string {
    return `<svg>${uid}</svg>`;
  }
}

/** Hands out the given MACs in order (for devices that have no usable MAC of their own). */
export class SequenceMacGenerator extends RandomMacGenerator {
  private index = 0;

  constructor(private readonly macs: string[]) {
    super();
  }

  next(): MacAddress {
    const raw = this.macs[Math.min(this.index, this.macs.length - 1)] ?? '02:00:00:00:00:00';
    this.index++;
    const mac = MacAddress.parse(raw);
    if (!mac.ok) throw mac.error;
    return mac.value;
  }
}
