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
import { Captchas } from '../captchas.js';
import { DeviceIdentity } from '../device-identity.js';
import { AnswerAppCaptchaUseCase } from './answer-app-captcha.use-case.js';
import { BindAppUidUseCase } from './bind-app-uid.use-case.js';
import { IssueCaptchaUseCase } from './issue-captcha.use-case.js';

const now = new Date('2026-10-28T10:00:00Z');

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

describe('Old mobile apps: reset_uid binds the app uid', () => {
  let trials: InMemoryTrialDeviceRepository;
  let bind: BindAppUidUseCase;

  beforeEach(async () => {
    trials = new InMemoryTrialDeviceRepository();
    const identity = new DeviceIdentity(
      trials,
      new InMemoryPaidDeviceRepository(),
      new InProcessDeviceLock(),
    );
    bind = new BindAppUidUseCase(identity, new FixedClock(now));
    await trials.insert(trialDevice({ uid: 'install-1' }));
  });

  it('stores a new uid', async () => {
    const result = await bind.execute({ mac: mac('00:1a:2b:3c:4d:5e'), uid: ' install-2 ' });

    expect(result.ok && result.value.changed).toBe(true);
    expect((await trials.findById('trial-1'))?.uid).toBe('install-2');
  });

  it('changes nothing when the uid is already the stored one', async () => {
    const result = await bind.execute({ mac: mac('00:1a:2b:3c:4d:5e'), uid: 'install-1' });

    expect(result.ok && result.value.changed).toBe(false);
  });

  it('refuses an unknown MAC and an empty or overlong uid', async () => {
    const unknown = await bind.execute({ mac: mac('00:1a:2b:3c:4d:99'), uid: 'x' });
    const empty = await bind.execute({ mac: mac('00:1a:2b:3c:4d:5e'), uid: '  ' });
    const long = await bind.execute({ mac: mac('00:1a:2b:3c:4d:5e'), uid: 'u'.repeat(129) });

    expect(!unknown.ok && unknown.error.code).toBe('devices.not_found');
    expect(!empty.ok && empty.error.code).toBe('devices.invalid_uid');
    expect(!long.ok && long.error.code).toBe('devices.invalid_uid');
  });
});

describe('Old Android app: the registration captcha (no MAC)', () => {
  let issue: IssueCaptchaUseCase;
  let answer: AnswerAppCaptchaUseCase;

  beforeEach(() => {
    const captchas = new Captchas(new InMemoryCaptchaRepository(), new FixedClock(now));
    issue = new IssueCaptchaUseCase(captchas, new FakeCaptchaImage());
    answer = new AnswerAppCaptchaUseCase(captchas);
  });

  const newCaptcha = () =>
    issue.execute({ kind: 'web', mac: null, appDeviceId: null, platform: 'android', length: 6 });

  it('accepts the right answer once', async () => {
    const { token, text } = await newCaptcha();

    expect((await answer.execute({ token, answer: text })).ok).toBe(true);
    expect((await answer.execute({ token, answer: text })).ok).toBe(false);
  });

  it('a wrong answer uses the captcha up', async () => {
    const { token, text } = await newCaptcha();

    expect((await answer.execute({ token, answer: 'WRONG1' })).ok).toBe(false);
    expect((await answer.execute({ token, answer: text })).ok).toBe(false);
  });

  it('does not take a captcha issued for a MAC', async () => {
    const { token, text } = await issue.execute({
      kind: 'web',
      mac: mac('00:1a:2b:3c:4d:5e'),
      appDeviceId: null,
      platform: null,
      length: 6,
    });

    expect((await answer.execute({ token, answer: text })).ok).toBe(false);
  });
});
