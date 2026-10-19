import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeCaptchaImages,
  InMemoryCaptchaStore,
  InMemoryDeviceRepository,
  InMemoryDeviceSettings,
  SequenceMacGenerator,
  SequenceKeyGenerator,
} from '../../../../../test/support/in-memory-device.repository.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { GetV4DeviceInfoUseCase } from './get-v4-device-info.use-case.js';
import { LoginV4DeviceUseCase } from './login-v4-device.use-case.js';
import { RegisterOrGetDeviceUseCase } from './register-or-get-device.use-case.js';
import { RequestRegistrationCaptchaUseCase } from './request-registration-captcha.use-case.js';

const MAC = 'CC:00:00:00:00:02';

describe('V4 device flow', () => {
  let repo: InMemoryDeviceRepository;
  let captchas: InMemoryCaptchaStore;
  let recaptcha: RequestRegistrationCaptchaUseCase;
  let login: LoginV4DeviceUseCase;
  let info: GetV4DeviceInfoUseCase;

  beforeEach(() => {
    repo = new InMemoryDeviceRepository();
    captchas = new InMemoryCaptchaStore();
    const clock = new FixedClock(new Date('2026-10-19T10:00:00Z'));
    const settings = new InMemoryDeviceSettings();
    const register = new RegisterOrGetDeviceUseCase(
      repo,
      new SequenceKeyGenerator(['111111', '222222']),
      clock,
      settings,
      new SequenceMacGenerator(['02:00:00:00:00:01', '02:00:00:00:00:02', '02:00:00:00:00:03']),
    );
    const images = new FakeCaptchaImages();
    recaptcha = new RequestRegistrationCaptchaUseCase(repo, captchas, images);
    login = new LoginV4DeviceUseCase(repo, captchas, images, register, clock);
    info = new GetV4DeviceInfoUseCase(repo, captchas, images, settings, clock);
  });

  /** recaptcha → login with the right answer: the normal first start of a V4 app. */
  async function registerV4(uid = 'AB12CD') {
    const captcha = await recaptcha.execute({ macAddress: MAC });
    if (!captcha.ok || captcha.value.kind !== 'captcha') throw new Error('expected a captcha');
    const result = await login.execute({
      macAddress: MAC,
      appType: 'lg',
      uid,
      recaptchaCode: 'abcd',
      recaptchaToken: captcha.value.token,
    });
    if (!result.ok || result.value.kind !== 'logged_in') throw new Error('expected a login');
    return result.value.device;
  }

  describe('recaptcha', () => {
    it('gives a new MAC a captcha and stores its answer', async () => {
      const result = await recaptcha.execute({ macAddress: 'cc-00-00-00-00-02' });

      expect(result).toEqual({
        ok: true,
        value: { kind: 'captcha', svg: '<svg>ABCD</svg>', token: 'tok-1' },
      });
      expect(captchas.items).toEqual([
        { purpose: 'registration', mac: 'cc:00:00:00:00:02', token: 'tok-1', text: 'ABCD' },
      ]);
    });

    it('answers already_verified once the device passed a captcha', async () => {
      await registerV4();

      expect(await recaptcha.execute({ macAddress: MAC })).toEqual({
        ok: true,
        value: { kind: 'already_verified' },
      });
    });

    it('rejects an invalid MAC', async () => {
      const result = await recaptcha.execute({ macAddress: 'nope' });

      expect(!result.ok && result.error.code).toBe('kernel.invalid_mac_address');
    });
  });

  describe('device_login', () => {
    it('creates a pending V4 device with its u_id after a correct captcha, and consumes the captcha', async () => {
      const device = await registerV4('ab12cd');

      expect(device.state).toBe('pending');
      expect(device.uid?.value).toBe('AB12CD');
      expect(device.v4Verified).toBe(true);
      expect(repo.pending.size).toBe(1);
      expect(captchas.items).toEqual([]);
    });

    it('requires captcha code and token for a device that never passed one', async () => {
      const result = await login.execute({ macAddress: MAC, appType: 'lg', uid: 'AB12CD' });

      expect(!result.ok && result.error.code).toBe('devices.captcha_required');
      expect(repo.pending.size).toBe(0);
    });

    it('refuses a wrong or reused captcha', async () => {
      const captcha = await recaptcha.execute({ macAddress: MAC });
      if (!captcha.ok || captcha.value.kind !== 'captcha') throw new Error('expected a captcha');

      const wrong = await login.execute({
        macAddress: MAC,
        appType: 'lg',
        uid: 'AB12CD',
        recaptchaCode: 'ZZZZ',
        recaptchaToken: captcha.value.token,
      });

      expect(!wrong.ok && wrong.error.code).toBe('devices.captcha_invalid');
      expect(repo.pending.size).toBe(0);
    });

    it('logs a verified device in again without a captcha', async () => {
      const first = await registerV4();

      const again = await login.execute({ macAddress: MAC, appType: 'lg', uid: 'ab12cd' });

      expect(again.ok && again.value.kind === 'logged_in' && again.value.device.id).toBe(first.id);
    });

    it('asks a different install (other u_id) to prove ownership with the u_id recovery captcha', async () => {
      await registerV4('AB12CD');

      const challenged = await login.execute({ macAddress: MAC, appType: 'lg', uid: 'ZZ99ZZ' });

      expect(challenged).toEqual({
        ok: true,
        value: { kind: 'uid_challenge', retry: false, svg: '<svg>AB12CD</svg>', token: 'tok-2' },
      });
    });

    it('accepts the new u_id once the stored one is typed back from the image', async () => {
      await registerV4('AB12CD');
      const challenged = await login.execute({ macAddress: MAC, appType: 'lg', uid: 'ZZ99ZZ' });
      if (!challenged.ok || challenged.value.kind !== 'uid_challenge')
        throw new Error('expected a challenge');

      const wrong = await login.execute({
        macAddress: MAC,
        appType: 'lg',
        uid: 'ZZ99ZZ',
        uidCaptchaCode: 'XXXXXX',
        uidCaptchaToken: challenged.value.token,
      });
      const fresh = wrong.ok && wrong.value.kind === 'uid_challenge' ? wrong.value : null;
      const right = await login.execute({
        macAddress: MAC,
        appType: 'lg',
        uid: 'ZZ99ZZ',
        uidCaptchaCode: 'ab12cd',
        uidCaptchaToken: fresh?.token ?? '',
      });

      expect(fresh?.retry).toBe(true);
      expect(right.ok && right.value.kind === 'logged_in' && right.value.device.uid?.value).toBe(
        'ZZ99ZZ',
      );
    });

    it('rejects an invalid u_id before anything else', async () => {
      const result = await login.execute({ macAddress: MAC, appType: 'lg', uid: 'abc' });

      expect(!result.ok && result.error.code).toBe('devices.invalid_uid');
    });
  });

  describe('device_info', () => {
    it("returns the token's device with the brand's trial length", async () => {
      const device = await registerV4();

      const result = await info.execute({
        tokenDeviceId: device.id,
        tokenMac: 'CC:00:00:00:00:02',
        macAddress: MAC,
        uid: 'AB12CD',
      });

      if (!result.ok || result.value.kind !== 'device') throw new Error('expected device info');
      expect(result.value.device.id).toBe(device.id);
      expect(result.value.trialDays).toBe(7);
    });

    it('refuses a token whose device id does not match the MAC', async () => {
      await registerV4();

      const result = await info.execute({
        tokenDeviceId: 'someone-else',
        tokenMac: MAC,
        macAddress: MAC,
        uid: 'AB12CD',
      });

      expect(!result.ok && result.error.code).toBe('devices.token_invalid');
    });

    it('refuses a body MAC different from the token MAC', async () => {
      const device = await registerV4();

      const result = await info.execute({
        tokenDeviceId: device.id,
        tokenMac: MAC,
        macAddress: 'CC:00:00:00:00:03',
        uid: 'AB12CD',
      });

      expect(!result.ok && result.error.code).toBe('devices.token_mac_mismatch');
    });

    it('says not registered for an unknown MAC', async () => {
      const result = await info.execute({
        tokenDeviceId: 'x',
        tokenMac: MAC,
        macAddress: MAC,
        uid: 'AB12CD',
      });

      expect(!result.ok && result.error.code).toBe('devices.not_registered');
    });

    it('challenges a different u_id, like login', async () => {
      const device = await registerV4('AB12CD');

      const result = await info.execute({
        tokenDeviceId: device.id,
        tokenMac: MAC,
        macAddress: MAC,
        uid: 'ZZ99ZZ',
      });

      expect(result.ok && result.value.kind).toBe('uid_challenge');
    });
  });
});
