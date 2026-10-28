import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeCaptchaImage,
  InMemoryCaptchaRepository,
  InMemoryPaidDeviceRepository,
  InMemoryTrialDeviceRepository,
  InProcessDeviceLock,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { CAPTCHA_TTL_MS } from '../../domain/captcha.js';
import { Captchas } from '../captchas.js';
import { DeviceIdentity } from '../device-identity.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { CheckCaptchaCodeUseCase } from './check-captcha-code.use-case.js';
import { IssueCaptchaUseCase } from './issue-captcha.use-case.js';
import { IssueUidRecoveryCaptchaUseCase } from './issue-uid-recovery-captcha.use-case.js';
import { type LoginV4DeviceInput, LoginV4DeviceUseCase } from './login-v4-device.use-case.js';
import { RegisterDeviceUseCase } from './register-device.use-case.js';

const start = new Date('2026-10-26T10:00:00Z');

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};
const TV = mac('00:1a:2b:3c:4d:5e');

class MovableClock extends FixedClock {
  at = start;
  override now() {
    return new Date(this.at);
  }
}

class Settings extends DeviceSettings {
  trialDays() {
    return Promise.resolve(7);
  }
  reviewBuilds() {
    return Promise.resolve([]);
  }
}

class Keys extends DeviceKeyGenerator {
  next() {
    return '123456';
  }
}

describe('Captchas and V4 login (DEV-4)', () => {
  let clock: MovableClock;
  let captchaRows: InMemoryCaptchaRepository;
  let trials: InMemoryTrialDeviceRepository;
  let image: FakeCaptchaImage;
  let issue: IssueCaptchaUseCase;
  let issueUid: IssueUidRecoveryCaptchaUseCase;
  let checkCode: CheckCaptchaCodeUseCase;
  let login: LoginV4DeviceUseCase;

  beforeEach(() => {
    clock = new MovableClock(start);
    captchaRows = new InMemoryCaptchaRepository();
    trials = new InMemoryTrialDeviceRepository();
    image = new FakeCaptchaImage('AB7K');
    const paid = new InMemoryPaidDeviceRepository();
    const identity = new DeviceIdentity(trials, paid, new InProcessDeviceLock());
    const captchas = new Captchas(captchaRows, clock);
    const register = new RegisterDeviceUseCase(
      identity,
      trials,
      paid,
      new Settings(),
      new Keys(),
      clock,
    );
    issue = new IssueCaptchaUseCase(captchas, image);
    issueUid = new IssueUidRecoveryCaptchaUseCase(identity, captchas, image);
    checkCode = new CheckCaptchaCodeUseCase(captchas);
    login = new LoginV4DeviceUseCase(identity, captchas, register, clock);
  });

  const issueFor = (forMac = TV) =>
    issue.execute({ kind: 'v4', mac: forMac, appDeviceId: null, platform: 'samsung', length: 4 });

  const loginCall = (overrides: Partial<LoginV4DeviceInput> = {}): LoginV4DeviceInput => ({
    mac: TV,
    platform: 'samsung',
    uid: 'QW12ER',
    ip: '198.51.100.20',
    appVersion: '4.0.1',
    captcha: null,
    uidCaptcha: null,
    ...overrides,
  });

  describe('issuing', () => {
    it('stores only a hash of the text and returns the picture with a token', async () => {
      const { token, svg } = await issueFor();

      const row = [...captchaRows.items.values()][0]!;
      expect(svg).toBe('<svg>AB7K</svg>');
      expect(row).toMatchObject({ token, kind: 'v4', macAddress: TV.value, verifiedAt: null });
      expect(row.answerHash).not.toContain('AB7K');
      expect(row.expiresAt).toEqual(new Date(start.getTime() + CAPTCHA_TTL_MS));
    });
  });

  describe('V4 registration', () => {
    it('asks a new MAC for a captcha', async () => {
      const result = await login.execute(loginCall());

      expect(!result.ok && result.error.code).toBe('devices.captcha_required');
      expect(trials.items.size).toBe(0);
    });

    it('registers the device with a trial and the uid once the captcha is solved', async () => {
      const { token } = await issueFor();

      const result = await login.execute(loginCall({ captcha: { token, answer: 'ab7k' } }));

      expect(result.ok && result.value.device).toMatchObject({
        macAddress: TV.value,
        uid: 'QW12ER',
        apiVersion: 'v4',
      });
      expect(trials.items.size).toBe(1);
    });

    it('skips the captcha on every later login of a MAC that solved one', async () => {
      const { token } = await issueFor();
      await login.execute(loginCall({ captcha: { token, answer: 'AB7K' } }));

      const again = await login.execute(loginCall());

      expect(again.ok).toBe(true);
      expect(trials.items.size).toBe(1);
    });

    it('refuses a wrong answer, and the captcha is used up', async () => {
      const { token } = await issueFor();

      const wrong = await login.execute(loginCall({ captcha: { token, answer: 'ZZZZ' } }));
      const retry = await login.execute(loginCall({ captcha: { token, answer: 'AB7K' } }));

      expect(!wrong.ok && wrong.error.code).toBe('devices.invalid_captcha');
      expect(!retry.ok && retry.error.code).toBe('devices.invalid_captcha');
    });

    it('refuses an answer after the captcha expired', async () => {
      const { token } = await issueFor();
      clock.at = new Date(start.getTime() + CAPTCHA_TTL_MS + 1);

      const result = await login.execute(loginCall({ captcha: { token, answer: 'AB7K' } }));

      expect(!result.ok && result.error.code).toBe('devices.invalid_captcha');
    });

    it('refuses a captcha solved for another MAC', async () => {
      const { token } = await issueFor(mac('00:00:00:00:00:aa'));

      const result = await login.execute(loginCall({ captcha: { token, answer: 'AB7K' } }));

      expect(!result.ok && result.error.code).toBe('devices.invalid_captcha');
    });

    it('accepts a captcha answer only once, even when sent twice at once', async () => {
      const { token } = await issueFor();
      const answer = { token, answer: 'AB7K' };

      const results = await Promise.all([
        login.execute(loginCall({ captcha: answer })),
        login.execute(loginCall({ captcha: answer })),
      ]);

      expect(results.filter((r) => r.ok)).toHaveLength(1);
    });

    it('refuses a uid that is not 6 letters or digits', async () => {
      const result = await login.execute(loginCall({ uid: 'QW-12' }));

      expect(!result.ok && result.error.code).toBe('devices.invalid_uid');
    });

    it('refuses a fallback MAC', async () => {
      const result = await login.execute(loginCall({ mac: mac('52:54:00:12:34:57') }));

      expect(!result.ok && result.error.code).toBe('devices.usable_mac_required');
    });
  });

  describe('uid recovery', () => {
    beforeEach(async () => {
      const { token } = await issueFor();
      await login.execute(loginCall({ captcha: { token, answer: 'AB7K' } }));
    });

    it('asks for the recovery captcha when the uid does not match', async () => {
      const result = await login.execute(loginCall({ uid: 'NEW999' }));

      expect(!result.ok && result.error.code).toBe('devices.uid_mismatch');
    });

    it('shows the stored uid, and solving it stores the new uid', async () => {
      const issued = await issueUid.execute({ mac: TV, platform: 'samsung' });
      expect(issued.ok && issued.value.svg).toBe('<svg>QW12ER</svg>');
      if (!issued.ok) return;

      const result = await login.execute(
        loginCall({ uid: 'NEW999', uidCaptcha: { token: issued.value.token, answer: 'qw12er' } }),
      );

      expect(result.ok && result.value.device.uid).toBe('NEW999');
      expect([...trials.items.values()][0]?.uid).toBe('NEW999');
    });

    it('keeps the stored uid after a wrong recovery answer', async () => {
      const issued = await issueUid.execute({ mac: TV, platform: 'samsung' });
      if (!issued.ok) throw issued.error;

      const result = await login.execute(
        loginCall({ uid: 'NEW999', uidCaptcha: { token: issued.value.token, answer: 'XXXXXX' } }),
      );

      expect(!result.ok && result.error.code).toBe('devices.invalid_captcha');
      expect([...trials.items.values()][0]?.uid).toBe('QW12ER');
    });

    it('does not accept a registration captcha in place of the recovery one', async () => {
      const { token } = await issueFor();

      const result = await login.execute(
        loginCall({ uid: 'NEW999', uidCaptcha: { token, answer: 'AB7K' } }),
      );

      expect(!result.ok && result.error.code).toBe('devices.invalid_captcha');
    });
  });

  describe('TV apps that send the same solved code on every start', () => {
    it('answers the open captcha with the code, then keeps accepting that code', async () => {
      await trials.insert(trialDevice());
      await issueFor();

      const first = await checkCode.execute({ mac: TV, code: 'AB7K' });
      clock.at = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
      const later = await checkCode.execute({ mac: TV, code: 'ab7k' });

      expect(first.ok && later.ok).toBe(true);
    });

    it('refuses another code, and a code with no captcha issued', async () => {
      const none = await checkCode.execute({ mac: TV, code: 'AB7K' });
      await issueFor();
      await checkCode.execute({ mac: TV, code: 'AB7K' });

      const other = await checkCode.execute({ mac: TV, code: 'ZZZZ' });

      expect(none.ok).toBe(false);
      expect(other.ok).toBe(false);
    });
  });
});
