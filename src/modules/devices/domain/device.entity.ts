import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import type { AppType } from './app-type.js';
import { addDays } from './device.policy.js';
import { TrialDays } from './trial-days.js';
import type { AppDeviceId, AppUid } from './device-identity.js';
import type { Uid } from './uid.js';

/** `pending` lives in pendingDevices (not paid, kept forever); `paid` lives in devices. */
export type DeviceState = 'pending' | 'paid';

export interface DeviceProps {
  id: string;
  macAddress: MacAddress;
  appType: AppType;
  deviceKey: string;
  state: DeviceState;
  trialExpiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  activatedAt: Date | null;
  /** The install id some apps send; identifies devices that have no usable MAC (DEV-10). */
  appDeviceId: AppDeviceId | null;
  /** The install uid iOS/Android v2-v3 apps send; the device keeps the first one it saw. */
  appUid: AppUid | null;
  /** V4 apps' `u_id`; null until a V4 app registers or logs in. */
  uid: Uid | null;
  /** Passed the V4 registration captcha once; V4 logins no longer need one. */
  v4Verified: boolean;
}

/**
 * One TV or phone of one brand, identified by its normalized MAC.
 * It starts as a pending trial and becomes paid only through activate().
 */
export class Device {
  private constructor(private readonly props: DeviceProps) {}

  static registerTrial(input: {
    id: string;
    macAddress: MacAddress;
    appType: AppType;
    deviceKey: string;
    now: Date;
    /** The brand's trial length; 7 days when omitted. */
    trialDays?: TrialDays;
    uid?: Uid;
    v4Verified?: boolean;
    appDeviceId?: AppDeviceId;
  }): Device {
    return new Device({
      id: input.id,
      macAddress: input.macAddress,
      appType: input.appType,
      deviceKey: input.deviceKey,
      state: 'pending',
      trialExpiresAt: addDays(input.now, (input.trialDays ?? TrialDays.default()).days),
      createdAt: input.now,
      lastSeenAt: input.now,
      activatedAt: null,
      appDeviceId: input.appDeviceId ?? null,
      appUid: null,
      uid: input.uid ?? null,
      v4Verified: input.v4Verified ?? false,
    });
  }

  /** Rebuilds a device from storage. Only repositories call this. */
  static restore(props: DeviceProps): Device {
    return new Device({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get macAddress(): MacAddress {
    return this.props.macAddress;
  }
  get appType(): AppType {
    return this.props.appType;
  }
  get deviceKey(): string {
    return this.props.deviceKey;
  }
  get state(): DeviceState {
    return this.props.state;
  }
  get trialExpiresAt(): Date {
    return this.props.trialExpiresAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get lastSeenAt(): Date {
    return this.props.lastSeenAt;
  }
  get activatedAt(): Date | null {
    return this.props.activatedAt;
  }
  get appUid(): AppUid | null {
    return this.props.appUid;
  }
  get appDeviceId(): AppDeviceId | null {
    return this.props.appDeviceId;
  }
  get uid(): Uid | null {
    return this.props.uid;
  }
  get v4Verified(): boolean {
    return this.props.v4Verified;
  }
  get isPaid(): boolean {
    return this.props.state === 'paid';
  }

  isTrialExpired(now: Date): boolean {
    return this.props.trialExpiresAt.getTime() <= now.getTime();
  }

  recordVisit(now: Date): void {
    this.props.lastSeenAt = now;
  }

  /** Sets the u_id if the device has none yet. Returns whether it changed. */
  adoptUidIfMissing(uid: Uid): boolean {
    if (this.props.uid) return false;
    this.props.uid = uid;
    return true;
  }

  /** Sets the v2-v3 install uid if the device has none yet. Returns whether it changed. */
  adoptAppUidIfMissing(uid: AppUid): boolean {
    if (this.props.appUid) return false;
    this.props.appUid = uid;
    return true;
  }

  /** Replaces the u_id after the owner proved they know the current one (uid recovery captcha). */
  replaceUid(uid: Uid): void {
    this.props.uid = uid;
  }

  markV4Verified(): void {
    this.props.v4Verified = true;
  }

  /** Marks the device as paid. Returns false (and changes nothing) if it already was. */
  activate(now: Date): boolean {
    if (this.props.state === 'paid') return false;
    this.props.state = 'paid';
    this.props.activatedAt = now;
    return true;
  }
}
