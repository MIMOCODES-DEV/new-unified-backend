import { describe, expect, it } from 'vitest';
import { deviceInfoBody, uidChallengeBody } from './v4.presenter.js';

const trial = {
  deviceKey: '890934',
  isPaid: false,
  trialExpiresAt: new Date('2026-10-22T09:30:00Z'),
  activatedAt: null,
};

describe('V4 presenter', () => {
  it('device_info: same keys, order and values as the recorded iboplayer response', () => {
    const body = deviceInfoBody({ device: trial, trialDays: 7, ipAddress: '' });

    // Recorded: test/fixtures/legacy/http/iboplayer.json, "v4 device_info"
    expect(JSON.stringify(body)).toBe(
      JSON.stringify({
        has_own_playlist: false,
        mac_registered: true,
        ip_address: '',
        notification_interval: 300,
        notification: { title: '', content: '' },
        urls: [{ origin_type: 'general' }],
        themes: [],
        trial_days: 7,
        status: 'success',
        is_expired: false,
        device_key: '890934',
        is_trial: 0,
        expire_date: '2026-10-22',
        languages: [],
      }),
    );
  });

  it('device_info: a paid device is reported as lifetime (is_trial 2) until real licences exist', () => {
    const body = deviceInfoBody({
      device: { ...trial, isPaid: true, activatedAt: new Date('2026-10-20T00:00:00Z') },
      trialDays: 7,
      ipAddress: '1.2.3.4',
    });

    expect(body).toMatchObject({ is_trial: 2, expire_date: '2443-06-20', ip_address: '1.2.3.4' });
  });

  it('uid challenge: the old message for a first mismatch and for a wrong answer', () => {
    expect(uidChallengeBody({ retry: false, svg: '<svg/>', token: 't' })).toEqual({
      status: 'uid_mismatch_captcha',
      error_code: 401,
      message: 'Device ID mismatch. Enter the code shown in the image to verify ownership.',
      captcha: '<svg/>',
      captcha_token: 't',
    });
    expect(uidChallengeBody({ retry: true, svg: '<svg/>', token: 't' }).message).toBe(
      'Incorrect code. Please read the image carefully and try again.',
    );
  });
});
