import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCaptchaRepository } from '../../../../../test/support/in-memory-captcha.repository.js';
import { InMemoryDeviceRepository } from '../../../../../test/support/in-memory-device.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { CaptchaImageGenerator } from '../ports/captcha.ports.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import {
  IsCaptchaVerifiedUseCase,
  IssueCaptchaUseCase,
  VerifyCaptchaUseCase,
} from './device-captcha.use-cases.js';
import { LoginV4DeviceUseCase } from './login-v4-device.use-case.js';
import { RegisterDeviceUseCase } from './register-device.use-case.js';

const MAC = 'aa:bb:cc:dd:ee:ff';

class FixedImage extends CaptchaImageGenerator {
  create() {
    return { text: 'K7PX', svg: '<svg/>' };
  }
}
class SevenDays extends DeviceSettings {
  trialDays() {
    return Promise.resolve(7);
  }
}
class OneKey extends DeviceKeyGenerator {
  next() {
    return '123456';
  }
}

describe('LoginV4DeviceUseCase', () => {
  let devices: InMemoryDeviceRepository;
  let issue: IssueCaptchaUseCase;
  let login: LoginV4DeviceUseCase;

  beforeEach(() => {
    devices = new InMemoryDeviceRepository();
    const captchas = new InMemoryCaptchaRepository();
    const clock = new FixedClock(new Date('2026-10-19T10:00:00Z'));
    issue = new IssueCaptchaUseCase(captchas, new FixedImage(), clock);
    login = new LoginV4DeviceUseCase(
      devices,
      new IsCaptchaVerifiedUseCase(captchas),
      new VerifyCaptchaUseCase(captchas, clock),
      new RegisterDeviceUseCase(devices, new SevenDays(), new OneKey(), clock),
    );
  });

  async function captchaToken(): Promise<string> {
    const result = await issue.execute(MAC, { length: 4, width: 300, withToken: true });
    if (!result.ok || !result.value.token) throw new Error('no captcha');
    return result.value.token;
  }

  it('a new device needs a captcha', async () => {
    const result = await login.execute({ mac: MAC, appType: 'lg', uid: 'ACDE13' });

    expect(!result.ok && result.error.code).toBe('devices.captcha_required');
  });

  it('refuses a wrong answer or the wrong token', async () => {
    const token = await captchaToken();

    const wrongAnswer = await login.execute({
      mac: MAC,
      appType: 'lg',
      uid: 'ACDE13',
      captchaCode: 'XXXX',
      captchaToken: token,
    });
    const wrongToken = await login.execute({
      mac: MAC,
      appType: 'lg',
      uid: 'ACDE13',
      captchaCode: 'K7PX',
      captchaToken: 'other',
    });

    expect(!wrongAnswer.ok && wrongAnswer.error.code).toBe('devices.invalid_captcha');
    expect(!wrongToken.ok && wrongToken.error.code).toBe('devices.invalid_captcha');
    expect(devices.items.size).toBe(0);
  });

  it('registers the device with its u_id after a correct captcha', async () => {
    const token = await captchaToken();

    const result = await login.execute({
      mac: MAC,
      appType: 'lg',
      uid: 'acde13',
      captchaCode: 'k7px',
      captchaToken: token,
    });

    expect(result.ok && result.value.uid).toBe('ACDE13');
    expect(result.ok && result.value.license.type).toBe('trial');
  });

  it('a verified device logs in again without a captcha, but not with another u_id', async () => {
    const token = await captchaToken();
    await login.execute({
      mac: MAC,
      appType: 'lg',
      uid: 'ACDE13',
      captchaCode: 'K7PX',
      captchaToken: token,
    });

    const again = await login.execute({ mac: MAC, appType: 'lg', uid: 'ACDE13' });
    const otherUid = await login.execute({ mac: MAC, appType: 'lg', uid: 'ZZZZ99' });

    expect(again.ok).toBe(true);
    expect(!otherUid.ok && otherUid.error.code).toBe('devices.uid_mismatch');
  });
});
