import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  API_VERSIONS,
  ChangeDeviceKeyUseCase,
  CheckCaptchaCodeUseCase,
  FindDeviceUseCase,
  IssueCaptchaUseCase,
  IssueUidRecoveryCaptchaUseCase,
  LoginV4DeviceUseCase,
  PLATFORMS,
  RegisterDeviceUseCase,
  SetParentPinUseCase,
  VerifyDeviceKeyUseCase,
} from '../../../modules/devices/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import type { Result } from '../../../shared/kernel/result.js';
import { DevOnlyGuard } from './dev-only.guard.js';

/** Business errors go to the global filter, which answers `{ error: { code, message } }`. */
function unwrap<T>(result: Result<T, Error>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

/** Bad input answers 400 with what is wrong. */
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(z.prettifyError(parsed.error));
  return parsed.data;
}

const mac = z.string().transform((value, ctx) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: 'Invalid MAC address' });
    return z.NEVER;
  }
  return parsed.value;
});

const answered = z.object({ token: z.string(), answer: z.string() }).nullable().default(null);

const registerBody = z.object({
  mac: mac.nullable().default(null),
  platform: z.enum(PLATFORMS),
  appDeviceId: z.string().nullable().default(null),
  uid: z.string().nullable().default(null),
  appVersion: z.string().nullable().default(null),
  apiVersion: z.enum(API_VERSIONS).default('legacy'),
});

const captchaBody = z.object({
  kind: z.enum(['v4', 'web']).default('v4'),
  mac: mac.nullable().default(null),
  platform: z.string().nullable().default(null),
  length: z.number().int().min(2).max(8).default(4),
  /** Dev only: also return the answer, to script captcha tests. */
  revealAnswer: z.boolean().default(false),
});

const v4LoginBody = z.object({
  mac,
  platform: z.enum(PLATFORMS),
  uid: z.string(),
  appVersion: z.string().nullable().default(null),
  appDeviceId: z.string().nullable().default(null),
  captcha: answered,
  uidCaptcha: answered,
});

/** Turns an SVG into a link the browser opens, to read the captcha while testing. */
const imageUrl = (svg: string) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/**
 * Dev-only routes to try the device core rules against a real database, before the real app
 * routes exist. Plain JSON, no envelope, no auth; 404 in production. Call them on a brand host,
 * for example `http://ibo.localhost:3000/dev/devices/register`.
 */
@Controller('dev/devices')
@UseGuards(DevOnlyGuard)
export class DevDevicesController {
  constructor(
    private readonly registerDevice: RegisterDeviceUseCase,
    private readonly findDevice: FindDeviceUseCase,
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly issueUidCaptcha: IssueUidRecoveryCaptchaUseCase,
    private readonly loginV4: LoginV4DeviceUseCase,
    private readonly checkCode: CheckCaptchaCodeUseCase,
    private readonly verifyKey: VerifyDeviceKeyUseCase,
    private readonly changeKey: ChangeDeviceKeyUseCase,
    private readonly setPin: SetParentPinUseCase,
  ) {}

  /** DEV-1/2/3/6: find or make a device, as an old app route would. */
  @Public()
  @Post('register')
  async register(@Body() body: unknown) {
    const input = parse(registerBody, body);
    return unwrap(await this.registerDevice.execute({ ...input, ip: '127.0.0.1' }));
  }

  @Public()
  @Get(':mac')
  async find(@Param('mac') value: string) {
    return unwrap(await this.findDevice.execute(parse(mac, value)));
  }

  /** DEV-4: a new captcha. Open `imageUrl` in a browser to read it, or send `revealAnswer: true`. */
  @Public()
  @Post('captcha')
  async captcha(@Body() body: unknown) {
    const { revealAnswer, ...input } = parse(captchaBody, body);
    const { token, svg, text } = await this.issueCaptcha.execute({ ...input, appDeviceId: null });
    return { token, imageUrl: imageUrl(svg), ...(revealAnswer ? { answer: text } : {}) };
  }

  /** DEV-4: V4 login; send `captcha` the first time, `uidCaptcha` after a uid mismatch. */
  @Public()
  @Post('v4/login')
  async v4Login(@Body() body: unknown) {
    const input = parse(v4LoginBody, body);
    return unwrap(await this.loginV4.execute({ ...input, ip: '127.0.0.1' }));
  }

  /** DEV-4: the uid recovery captcha (shows the stored uid). */
  @Public()
  @Post('v4/uid-captcha')
  async uidCaptcha(@Body() body: unknown) {
    const { revealAnswer, ...input } = parse(
      z.object({
        mac,
        platform: z.string().nullable().default(null),
        revealAnswer: z.boolean().default(false),
      }),
      body,
    );
    const { token, svg, text } = unwrap(await this.issueUidCaptcha.execute(input));
    return { token, imageUrl: imageUrl(svg), ...(revealAnswer ? { answer: text } : {}) };
  }

  /** DEV-4: old TV apps send the solved code on every start. */
  @Public()
  @Post('captcha-code')
  async captchaCode(@Body() body: unknown) {
    unwrap(await this.checkCode.execute(parse(z.object({ mac, code: z.string() }), body)));
    return { ok: true };
  }

  /** DEV-5: the website login (MAC + device key). */
  @Public()
  @Post('key/verify')
  async verify(@Body() body: unknown) {
    return unwrap(await this.verifyKey.execute(parse(z.object({ mac, key: z.string() }), body)));
  }

  /** DEV-5: a new device key; send `key: null` for a random one. */
  @Public()
  @Post(':id/key')
  async key(@Param('id') deviceId: string, @Body() body: unknown) {
    const { key } = parse(z.object({ key: z.string().nullable().default(null) }), body);
    return unwrap(await this.changeKey.execute({ deviceId, key }));
  }

  /** DEV-5: parental control; a 4-digit PIN turns it on, `null` turns it off. */
  @Public()
  @Post(':id/parent-pin')
  async parentPin(@Param('id') deviceId: string, @Body() body: unknown) {
    const { pin } = parse(z.object({ pin: z.string().nullable() }), body);
    return unwrap(await this.setPin.execute({ deviceId, pin }));
  }
}
