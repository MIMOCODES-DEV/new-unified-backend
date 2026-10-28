import { Body, Controller, Get, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  AnswerWebCaptchaUseCase,
  FindDeviceUseCase,
  IssueCaptchaUseCase,
} from '../../../modules/devices/index.js';
import { SubmitContactMessageUseCase } from '../../../modules/contact/index.js';
import { DeviceLicenseUseCase } from '../../../modules/licensing/index.js';
import {
  AddPlaylistByMacUseCase,
  DeletePlaylistsByMacUseCase,
  ListPlaylistsUseCase,
} from '../../../modules/playlists/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { RedisRateLimiter } from '../../../shared/redis/redis-rate-limiter.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import {
  BAD_REQUEST,
  CONFLICT,
  fail,
  limit,
  NOT_FOUND,
  parse,
  unwrap,
} from '../accounts/http-results.js';
import { captchaAnswer, playlistSource } from './site-schemas.js';
import { licenseView, playlistView } from './site-views.js';
import { XtreamAccountCheck } from './xtream-account-check.js';

/** The site's pictures: 5 characters, easy to read on a phone. */
const CAPTCHA_LENGTH = 5;
const CAPTCHA_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 };
/** Contact messages per IP: enough for a person, little for a spammer. */
const CONTACT_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };
/** Playlist checks per IP: each one makes the server call a provider. */
const CHECK_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

const CHECK_REFUSALS = {
  invalid: [BAD_REQUEST, 'An Xtream server with username and password is needed'],
  blocked: [BAD_REQUEST, 'This address cannot be checked'],
  unreachable: [502, 'The provider did not answer'],
  refused: [422, 'The provider did not accept this account'],
} as const;

const STATUSES = {
  'devices.invalid_captcha': BAD_REQUEST,
  'devices.not_found': NOT_FOUND,
  'playlists.device_not_found': NOT_FOUND,
  'playlists.invalid_playlist': BAD_REQUEST,
  'playlists.invalid_pin': BAD_REQUEST,
  'playlists.exists': CONFLICT,
  'playlists.name_taken': CONFLICT,
  'playlists.too_many_requests': 429,
  'contact.invalid_input': BAD_REQUEST,
};

/** An Xtream login carried in a get.php link (`?username=...&password=...`); null if not a link. */
function loginFromLink(
  value: string,
): { server: string; username: string; password: string } | null {
  try {
    const link = new URL(value.trim());
    return {
      server: `${link.origin}${link.pathname}`,
      username: link.searchParams.get('username') ?? '',
      password: link.searchParams.get('password') ?? '',
    };
  } catch {
    return null;
  }
}

/** A MAC as typed in a form; a bad one is a 400 with the same body as other bad requests. */
function macOf(value: string): MacAddress {
  const mac = MacAddress.parse(value);
  if (!mac.ok) throw fail(BAD_REQUEST, 'kernel.invalid_mac_address', 'Invalid MAC address');
  return mac.value;
}

/** Public tools on the brand site: no login, the brand comes from the host. */
@Controller('site')
export class SiteController {
  constructor(
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly answerCaptcha: AnswerWebCaptchaUseCase,
    private readonly findDevice: FindDeviceUseCase,
    private readonly license: DeviceLicenseUseCase,
    private readonly listPlaylists: ListPlaylistsUseCase,
    private readonly addByMac: AddPlaylistByMacUseCase,
    private readonly deleteByMac: DeletePlaylistsByMacUseCase,
    private readonly submitContact: SubmitContactMessageUseCase,
    private readonly xtream: XtreamAccountCheck,
    private readonly limiter: RedisRateLimiter,
    private readonly tenant: TenantContext,
  ) {}

  /** A captcha picture (SVG) and the token to send back with what the person typed. */
  @Public()
  @Get('captcha')
  async captcha(@Ip() ip: string) {
    await limit(this.limiter, CAPTCHA_LIMIT, `site:captcha:${this.tenant.current.id}:${ip}`);
    const { token, svg } = await this.issueCaptcha.execute({
      kind: 'web',
      mac: null,
      appDeviceId: null,
      platform: null,
      length: CAPTCHA_LENGTH,
    });
    return { token, svg };
  }

  /**
   * Is this TV registered, paid, until when, and does it have playlists (the old
   * checkMacValidByMac, before paying)? A captcha, so MACs cannot be probed in bulk.
   */
  @Public()
  @Post('device-status')
  @HttpCode(200)
  async deviceStatus(@Body() body: unknown) {
    const input = parse(z.object({ mac: z.string().max(64), captcha: captchaAnswer }), body);
    unwrap(await this.answerCaptcha.execute(input.captcha), STATUSES);
    const found = unwrap(await this.findDevice.execute(macOf(input.mac)), STATUSES);
    const deviceId = found.device.id;
    const license = unwrap(await this.license.execute(deviceId), STATUSES);
    return {
      macAddress: found.device.macAddress,
      paid: found.paid,
      license: licenseView(license),
      playlistCount: (await this.listPlaylists.execute(deviceId)).length,
    };
  }

  /**
   * Adds a playlist to a TV by its MAC alone (the QR code on the TV, the site's quick form), as
   * PL-6 allows: limited per IP and brand.
   */
  @Public()
  @Post('playlists')
  async addPlaylist(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(
      z.object({
        mac: z.string().max(64),
        name: z.string().max(200),
        source: playlistSource,
        epgUrl: z.string().max(2048).nullable().optional(),
        pin: z.string().max(16).nullable().optional(),
      }),
      body,
    );
    const { mac, ...playlist } = input;
    const saved = unwrap(
      await this.addByMac.execute({ mac: macOf(mac), ip, ...playlist }),
      STATUSES,
    );
    return { playlist: playlistView(saved) };
  }

  /** Deletes a TV's playlists by its MAC alone; protected ones are kept (PL-6). */
  @Public()
  @Post('playlists/delete-all')
  @HttpCode(200)
  async deleteAll(@Body() body: unknown, @Ip() ip: string) {
    const { mac } = parse(z.object({ mac: z.string().max(64) }), body);
    return unwrap(await this.deleteByMac.execute({ mac: macOf(mac), ip }), STATUSES);
  }

  /** The contact form: kept in the brand's database for staff (GET /admin/contact-messages). */
  @Public()
  @Post('contact')
  async contact(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const input = parse(
      z.object({
        name: z.string().max(500).nullable().optional(),
        email: z.string().max(300),
        subject: z.string().max(1000).nullable().optional(),
        message: z.string().max(20000),
      }),
      body,
    );
    await limit(this.limiter, CONTACT_LIMIT, `site:contact:${this.tenant.current.id}:${ip}`);
    return unwrap(
      await this.submitContact.execute({ ...input, ip, userAgent: userAgent ?? null }),
      STATUSES,
    );
  }

  /**
   * Asks the provider about an Xtream account: status, expiry, connections. Sent as server,
   * username and password, or as a get.php link carrying them.
   */
  @Public()
  @Post('check-playlist')
  @HttpCode(200)
  async checkPlaylist(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(
      z.union([
        z.object({
          server: z.string().max(2048),
          username: z.string().max(200),
          password: z.string().max(200),
        }),
        z.object({ url: z.string().max(2048) }),
      ]),
      body,
    );
    await limit(this.limiter, CHECK_LIMIT, `site:check-playlist:${this.tenant.current.id}:${ip}`);
    const login = 'url' in input ? loginFromLink(input.url) : input;
    const result = login
      ? await this.xtream.check(login)
      : ({ ok: false, reason: 'invalid' } as const);
    if (!result.ok) {
      const [status, message] = CHECK_REFUSALS[result.reason];
      throw fail(status, `site.playlist_${result.reason}`, message);
    }
    return { account: result.account };
  }
}
