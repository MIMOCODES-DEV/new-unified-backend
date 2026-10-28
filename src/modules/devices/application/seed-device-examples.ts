import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { Captcha } from '../domain/captcha.js';
import type { PaidDevice, TrialDevice } from '../domain/device.js';
import { DeviceIdentity } from './device-identity.js';
import { CaptchaRepository } from './ports/captcha.repository.js';
import { PaidDeviceRepository } from './ports/paid-device.repository.js';
import { TrialDeviceRepository } from './ports/trial-device.repository.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const endOfDayUtc = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * Example devices and captchas for local development (`pnpm cli seed:examples`), one of each kind
 * the schema knows. Ids start with `example-` and MACs with `02:00:` (never a real device), so
 * running it again refreshes the same rows. The licensing and playlists examples use these ids.
 */
@Injectable()
export class SeedDeviceExamples {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly trials: TrialDeviceRepository,
    private readonly paid: PaidDeviceRepository,
    private readonly captchas: CaptchaRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ trialDevices: number; devices: number; captchas: number }> {
    const now = this.clock.now();
    const trials = trialExamples(now);
    const paid = paidExamples(now);

    for (const device of trials) {
      // Through DeviceIdentity like a real sign-up; a second run refreshes the example.
      const { created, found } = await this.identity.claimTrial(device);
      if (!created && !found.paid && found.device.id === device.id)
        await this.trials.update(device);
    }

    for (const { device, extra } of paid) {
      const { found } = await this.identity.claimTrial(asTrial(device, now));
      const moved = found.paid
        ? { ok: true as const, value: found.device }
        : await this.identity.moveToPaid(found.device.id, device);
      if (!moved.ok) throw moved.error;
      await this.paid.update({ ...moved.value, ...device, ...extra });
    }

    const captchas = captchaExamples(now);
    for (const captcha of captchas) {
      const existing = await this.captchas.findByToken(captcha.token);
      if (existing) await this.captchas.update({ ...captcha, id: existing.id });
      else await this.captchas.insert(captcha);
    }

    return { trialDevices: trials.length, devices: paid.length, captchas: captchas.length };
  }
}

function base(now: Date) {
  return {
    appDeviceId: null,
    uid: null,
    stalkerEnabled: false,
    parentPin: '0000',
    apiVersion: 'legacy' as const,
    appVersion: '1.1.6',
    ip: '203.0.113.10',
    lastSeenAt: now,
    legacy: null,
    createdAt: new Date(now.getTime() - 2 * DAY),
    updatedAt: now,
  };
}

function trialExamples(now: Date): TrialDevice[] {
  const trial = (startedDaysAgo: number, lengthDays: number) => {
    const started = new Date(now.getTime() - startedDaysAgo * DAY);
    return {
      trialStartedAt: started,
      trialEndsAt: endOfDayUtc(new Date(started.getTime() + lengthDays * DAY)),
    };
  };
  return [
    {
      // A trial running, with two playlists (see the playlists examples).
      ...base(now),
      ...trial(2, 7),
      id: 'example-trial-new',
      macAddress: '02:00:00:00:01:01',
      platform: 'samsung',
      deviceKey: '100101',
      playlistCount: 2,
      firstPlaylistAt: new Date(now.getTime() - DAY),
    },
    {
      // A V4 app: sends a u_id and solved a captcha (see the captchas below).
      ...base(now),
      ...trial(1, 7),
      id: 'example-trial-v4',
      macAddress: '02:00:00:00:01:02',
      platform: 'lg',
      deviceKey: '100102',
      uid: 'EXAMPLEUID0001',
      apiVersion: 'v4',
      appVersion: '2.0.3',
      playlistCount: 0,
      firstPlaylistAt: null,
    },
    {
      // Trial ended weeks ago and never added a playlist: what the cleanup job (LIC-4) looks for.
      ...base(now),
      ...trial(40, 7),
      id: 'example-trial-ended',
      macAddress: '02:00:00:00:01:03',
      platform: 'android',
      deviceKey: '100103',
      playlistCount: 0,
      firstPlaylistAt: null,
    },
    {
      // A TV with no usable MAC: found by appDeviceId.
      ...base(now),
      ...trial(3, 7),
      id: 'example-trial-no-mac',
      macAddress: '02:00:00:00:01:04',
      appDeviceId: 'example-app-device-0001',
      platform: 'vidaa',
      deviceKey: '100104',
      playlistCount: 0,
      firstPlaylistAt: null,
    },
    {
      // Moved from an old backend: keeps the old id and fields under legacy.
      ...base(now),
      ...trial(5, 7),
      id: 'example-trial-migrated',
      macAddress: '02:00:00:00:01:05',
      platform: 'unknown',
      deviceKey: '100105',
      legacy: { id: '64f0c0ffee00000000000105', brand: 'ibo', device_model: 'UE55' },
      playlistCount: 0,
      firstPlaylistAt: null,
    },
  ];
}

type PaidExample = {
  device: Omit<PaidDevice, 'switch' | 'recovery'>;
  extra: Pick<PaidDevice, 'switch' | 'recovery'>;
};

function paidExamples(now: Date): PaidExample[] {
  const activated = new Date(now.getTime() - 300 * DAY);
  return [
    {
      // Yearly, extended early (two licenses stacked).
      device: {
        ...base(now),
        id: 'example-paid-yearly',
        macAddress: '02:00:00:00:02:01',
        platform: 'samsung',
        deviceKey: '200201',
        currentLicenseId: 'example-license-yearly-2',
        activatedAt: activated,
        resellerId: 'example-reseller-1',
        customerId: null,
      },
      extra: { switch: null, recovery: null },
    },
    {
      // Lifetime, bought in a multi-device store order, Stalker turned on.
      device: {
        ...base(now),
        id: 'example-paid-lifetime',
        macAddress: '02:00:00:00:02:02',
        platform: 'lg',
        deviceKey: '200202',
        uid: 'EXAMPLEUID0002',
        apiVersion: 'v4',
        stalkerEnabled: true,
        currentLicenseId: 'example-license-lifetime',
        activatedAt: activated,
        resellerId: null,
        customerId: null,
      },
      extra: { switch: null, recovery: null },
    },
    {
      // Switched MAC three days ago, and has a recovery code waiting to be used on a new TV.
      device: {
        ...base(now),
        id: 'example-paid-switched',
        macAddress: '02:00:00:00:02:03',
        platform: 'android_tv',
        deviceKey: '200203',
        currentLicenseId: 'example-license-switched',
        activatedAt: activated,
        resellerId: null,
        customerId: null,
      },
      extra: {
        switch: {
          from: '02:00:00:00:02:13',
          to: '02:00:00:00:02:03',
          at: new Date(now.getTime() - 3 * DAY),
          originMac: '02:00:00:00:02:13',
          count: 1,
        },
        recovery: {
          code: 'K7TN4QRW',
          expiresAt: new Date(now.getTime() + 30 * MINUTE),
          enabled: true,
          recoveredFrom: null,
          recoveredAt: null,
        },
      },
    },
    {
      // Paid once, license revoked: stays in devices with no valid license.
      device: {
        ...base(now),
        id: 'example-paid-revoked',
        macAddress: '02:00:00:00:02:04',
        platform: 'roku',
        deviceKey: '200204',
        currentLicenseId: 'example-license-revoked',
        activatedAt: activated,
        resellerId: null,
        customerId: null,
      },
      extra: { switch: null, recovery: null },
    },
  ];
}

/** The trial a paid example starts as, before DeviceIdentity moves it to devices. */
function asTrial(device: PaidExample['device'], now: Date): TrialDevice {
  return {
    id: device.id,
    macAddress: device.macAddress,
    appDeviceId: device.appDeviceId,
    platform: device.platform,
    deviceKey: device.deviceKey,
    uid: device.uid,
    stalkerEnabled: device.stalkerEnabled,
    parentPin: device.parentPin,
    apiVersion: device.apiVersion,
    appVersion: device.appVersion,
    ip: device.ip,
    lastSeenAt: device.lastSeenAt,
    legacy: device.legacy,
    createdAt: device.createdAt,
    updatedAt: now,
    trialStartedAt: device.createdAt,
    trialEndsAt: endOfDayUtc(new Date(device.createdAt.getTime() + 7 * DAY)),
    playlistCount: 0,
    firstPlaylistAt: null,
  };
}

function captchaExamples(now: Date): Captcha[] {
  const inTenMinutes = new Date(now.getTime() + 10 * MINUTE);
  const captcha = (c: Partial<Captcha> & Pick<Captcha, 'id' | 'token' | 'kind'>): Captcha => ({
    macAddress: null,
    appDeviceId: null,
    platform: null,
    answerHash: sha256('K7P2Q'),
    verifiedAt: null,
    expiresAt: inTenMinutes,
    createdAt: now,
    ...c,
  });
  return [
    // Unanswered captchas disappear 10 minutes after the seed (TTL); run the seed again to get them back.
    captcha({
      id: 'example-captcha-v4-open',
      token: 'example-token-v4-open',
      kind: 'v4',
      macAddress: '02:00:00:00:01:01',
      platform: 'samsung',
    }),
    // Solved: kept for its MAC with no expiry, so the V4 app can skip the next one.
    captcha({
      id: 'example-captcha-v4-solved',
      token: 'example-token-v4-solved',
      kind: 'v4',
      macAddress: '02:00:00:00:01:02',
      platform: 'lg',
      verifiedAt: new Date(now.getTime() - DAY),
      expiresAt: null,
      createdAt: new Date(now.getTime() - DAY),
    }),
    captcha({
      id: 'example-captcha-uid',
      token: 'example-token-uid',
      kind: 'uidRecovery',
      macAddress: '02:00:00:00:02:02',
      platform: 'lg',
    }),
    captcha({ id: 'example-captcha-web', token: 'example-token-web', kind: 'web' }),
  ];
}
