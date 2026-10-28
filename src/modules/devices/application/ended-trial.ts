import { randomUUID } from 'node:crypto';
import type { PaidDevice, TrialDevice } from '../domain/device.js';
import { trialEndsAt } from '../domain/trial.js';

/**
 * What a paid device leaves on its old MAC when it moves to a new TV (MAC switch, recovery): a
 * trial device whose trial ended yesterday, with nothing on it, so the old TV gets no new trial.
 */
export function endedTrialOnOldMac(
  device: PaidDevice,
  oldMac: string,
  deviceKey: string,
  at: Date,
): TrialDevice {
  return {
    id: randomUUID(),
    macAddress: oldMac,
    appDeviceId: null,
    platform: device.platform,
    deviceKey,
    uid: null,
    stalkerEnabled: false,
    parentPin: '0000',
    apiVersion: device.apiVersion,
    appVersion: device.appVersion,
    ip: device.ip,
    lastSeenAt: at,
    legacy: null,
    createdAt: at,
    updatedAt: at,
    trialStartedAt: at,
    trialEndsAt: trialEndsAt(at, -1),
    playlistCount: 0,
    firstPlaylistAt: null,
  };
}
