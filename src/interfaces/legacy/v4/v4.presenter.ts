import { legacyExpireDate, legacyIsTrial } from '../legacy-license.js';

/**
 * Wire bodies of the old V4 API, exactly as installed apps parse them (key order included).
 * Shape: iboplayer-backend (bob adds `parent_pin`, cr adds `rasp_enforce`; added with those brands).
 */

/** What device_info needs from a device; kept structural so the presenter stays a pure function. */
export interface V4DeviceView {
  deviceKey: string;
  isPaid: boolean;
  trialExpiresAt: Date;
  activatedAt: Date | null;
}

export function deviceInfoBody(input: {
  device: V4DeviceView;
  trialDays: number;
  ipAddress: string;
}): Record<string, unknown> {
  const { device } = input;
  return {
    has_own_playlist: false, // playlists module (PL) not built yet: the demo entry below is sent
    mac_registered: true,
    ip_address: input.ipAddress,
    notification_interval: 300,
    notification: { title: '', content: '' },
    urls: [{ origin_type: 'general' }], // the old parseM3uUrl output for an unset demo URL
    themes: [],
    trial_days: input.trialDays,
    status: 'success',
    is_expired: false, // always false in all three old backends; the apps judge expire_date
    device_key: device.deviceKey,
    is_trial: legacyIsTrial(device),
    expire_date: legacyExpireDate(device),
    languages: [],
  };
}

export function uidChallengeBody(input: {
  retry: boolean;
  svg: string;
  token: string;
}): Record<string, unknown> {
  return {
    status: 'uid_mismatch_captcha',
    error_code: 401,
    message: input.retry
      ? 'Incorrect code. Please read the image carefully and try again.'
      : 'Device ID mismatch. Enter the code shown in the image to verify ownership.',
    captcha: input.svg,
    captcha_token: input.token,
  };
}
