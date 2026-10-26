import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { FindDeviceUseCase, PLATFORMS } from '../../../modules/devices/index.js';
import {
  AddPlaylistByMacUseCase,
  AddPlaylistUseCase,
  DashboardPlaylistsUseCase,
  DeletePlaylistsByMacUseCase,
  DeletePlaylistUseCase,
  EditPlaylistUseCase,
  ListPlaylistsUseCase,
  MoveProviderHostUseCase,
  PlaylistReplyUseCase,
  SetPlaylistBackupUseCase,
  SetPlaylistPinUseCase,
  SyncPlaylistsUseCase,
  SyncPlaylistStatusUseCase,
  UnlockPlaylistUseCase,
} from '../../../modules/playlists/index.js';
import { Public } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import type { Result } from '../../../shared/kernel/result.js';
import { DevOnlyGuard } from './dev-only.guard.js';

function unwrap<T>(result: Result<T, Error>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

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

const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), url: z.string() }),
  z.object({
    kind: z.literal('xtream'),
    server: z.string(),
    username: z.string(),
    password: z.string(),
  }),
  z.object({
    kind: z.literal('stalker'),
    portalUrl: z.string(),
    portalName: z.string().nullable().optional(),
    fallbackUrl: z.string().nullable().optional(),
    mac: z.string().nullable().optional(),
  }),
  z.object({ kind: z.literal('code'), code: z.string() }),
]);

const by = z.enum(['app', 'dashboard']).default('app');
const pin = z.string().nullable().optional();

/**
 * Dev-only routes to try the Phase 1 playlist rules (PL-1 to PL-8) against a real database, for
 * the playground. Plain JSON, no envelope, no auth; 404 in production. The device is named by MAC.
 */
@Controller('dev/playlists')
@UseGuards(DevOnlyGuard)
export class DevPlaylistsController {
  constructor(
    private readonly findDevice: FindDeviceUseCase,
    private readonly add: AddPlaylistUseCase,
    private readonly edit: EditPlaylistUseCase,
    private readonly remove: DeletePlaylistUseCase,
    private readonly list: ListPlaylistsUseCase,
    private readonly sync: SyncPlaylistsUseCase,
    private readonly setPin: SetPlaylistPinUseCase,
    private readonly unlock: UnlockPlaylistUseCase,
    private readonly dashboard: DashboardPlaylistsUseCase,
    private readonly reply: PlaylistReplyUseCase,
    private readonly backup: SetPlaylistBackupUseCase,
    private readonly addByMac: AddPlaylistByMacUseCase,
    private readonly deleteByMac: DeletePlaylistsByMacUseCase,
    private readonly status: SyncPlaylistStatusUseCase,
    private readonly moveHost: MoveProviderHostUseCase,
  ) {}

  private async deviceId(value: string): Promise<string> {
    return unwrap(await this.findDevice.execute(parse(mac, value))).device.id;
  }

  /** The playlists as stored (everything, encrypted PIN included). */
  @Public()
  @Get(':mac')
  async stored(@Param('mac') value: string) {
    return this.list.execute(await this.deviceId(value));
  }

  /** PL-4: what the app gets. */
  @Public()
  @Get(':mac/reply')
  async appReply(@Param('mac') value: string, @Query() query: unknown) {
    const q = parse(
      z.object({
        platform: z.enum(PLATFORMS).default('samsung'),
        appVersion: z.string().nullable().default(null),
        stalkerEnabled: z.stringbool().default(true),
        includePins: z.stringbool().default(false),
      }),
      query,
    );
    return this.reply.execute({ deviceId: await this.deviceId(value), ...q });
  }

  /** PL-3: what the website dashboard lists (protected playlists hidden). */
  @Public()
  @Get(':mac/dashboard')
  async dashboardList(@Param('mac') value: string) {
    return this.dashboard.execute(await this.deviceId(value));
  }

  /** PL-1/2/3: add, optionally protected with a PIN. */
  @Public()
  @Post(':mac/add')
  async addOne(@Param('mac') value: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        name: z.string(),
        source,
        epgUrl: z.string().nullable().optional(),
        pin,
        via: z.enum(['app', 'website', 'store', 'admin']).default('app'),
      }),
      body,
    );
    return unwrap(
      await this.add.execute({
        deviceId: await this.deviceId(value),
        name: input.name,
        source: input.source,
        epgUrl: input.epgUrl,
        pin: input.pin,
        addedBy: { via: input.via, resellerId: null },
      }),
    );
  }

  /** PL-2/3: edit; `by: dashboard` needs the PIN of a protected playlist. */
  @Public()
  @Post(':mac/:id/edit')
  async editOne(
    @Param('mac') value: string,
    @Param('id') playlistId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        by,
        pin,
        name: z.string().optional(),
        source: source.optional(),
        epgUrl: z.string().nullable().optional(),
        newPin: z.string().nullable().optional(),
      }),
      body,
    );
    return unwrap(
      await this.edit.execute({ deviceId: await this.deviceId(value), playlistId, ...input }),
    );
  }

  @Public()
  @Post(':mac/:id/delete')
  async deleteOne(
    @Param('mac') value: string,
    @Param('id') playlistId: string,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ by, pin }), body);
    unwrap(
      await this.remove.execute({ deviceId: await this.deviceId(value), playlistId, ...input }),
    );
    return { deleted: true };
  }

  /** PL-3: protect, change the PIN, or remove it (`pin: null`). */
  @Public()
  @Post(':mac/:id/pin')
  async pinOne(
    @Param('mac') value: string,
    @Param('id') playlistId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({ by, pin: z.string().nullable(), currentPin: z.string().nullable().optional() }),
      body,
    );
    return unwrap(
      await this.setPin.execute({ deviceId: await this.deviceId(value), playlistId, ...input }),
    );
  }

  /** PL-3: the dashboard shows a protected playlist's data with its PIN. */
  @Public()
  @Post(':mac/:id/unlock')
  async unlockOne(
    @Param('mac') value: string,
    @Param('id') playlistId: string,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ pin }), body);
    return unwrap(
      await this.unlock.execute({ deviceId: await this.deviceId(value), playlistId, ...input }),
    );
  }

  /** PL-5: backup hosts; turning them off keeps the hosts. */
  @Public()
  @Post(':mac/:id/backup')
  async backupOne(
    @Param('mac') value: string,
    @Param('id') playlistId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({ by, pin, enabled: z.boolean(), hosts: z.array(z.string()).optional() }),
      body,
    );
    return unwrap(
      await this.backup.execute({ deviceId: await this.deviceId(value), playlistId, ...input }),
    );
  }

  /** PL-7: the app reports the provider account status. */
  @Public()
  @Post(':mac/:id/status')
  async statusOne(
    @Param('mac') value: string,
    @Param('id') playlistId: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z.object({
        status: z.string().nullable().optional(),
        expiresAt: z.union([z.string(), z.number()]).nullable().optional(),
      }),
      body,
    );
    return unwrap(await this.status.execute({ mac: parse(mac, value), playlistId, ...input }));
  }

  /** PL-2: the apps' bulk sync (update_playlist). */
  @Public()
  @Post(':mac/sync')
  async syncAll(@Param('mac') value: string, @Body() body: unknown) {
    const input = parse(
      z.object({
        playlists: z.array(
          z.object({
            originId: z.string().nullable().default(null),
            name: z.string(),
            url: z.string(),
          }),
        ),
        removeIds: z.array(z.string()).default([]),
      }),
      body,
    );
    return unwrap(
      await this.sync.execute({
        mac: parse(mac, value),
        ...input,
        addedBy: { via: 'app', resellerId: null },
      }),
    );
  }

  /** PL-6: add without a login (QR code, Stalker form); limited per IP. */
  @Public()
  @Post(':mac/by-mac/add')
  async addWithoutLogin(@Param('mac') value: string, @Ip() ip: string, @Body() body: unknown) {
    const input = parse(
      z.object({ name: z.string(), source, epgUrl: z.string().nullable().optional(), pin }),
      body,
    );
    return unwrap(await this.addByMac.execute({ mac: parse(mac, value), ip, ...input }));
  }

  /** PL-6: delete by MAC alone (keeps protected playlists); limited per IP. */
  @Public()
  @Post(':mac/by-mac/delete')
  async deleteWithoutLogin(@Param('mac') value: string, @Ip() ip: string) {
    return unwrap(await this.deleteByMac.execute({ mac: parse(mac, value), ip }));
  }

  /** PL-8: a provider moved host; `macs` limits it to those devices (a reseller). */
  @Public()
  @Post('move-host')
  async move(@Body() body: unknown) {
    const input = parse(
      z.object({
        from: z.string(),
        to: z.string(),
        countOnly: z.boolean().default(true),
        limit: z.number().int().positive().optional(),
        macs: z.array(mac).optional(),
      }),
      body,
    );
    return unwrap(
      await this.moveHost.execute({
        from: input.from,
        to: input.to,
        countOnly: input.countOnly,
        limit: input.limit,
        scope: input.macs ? { kind: 'devices', macs: input.macs } : { kind: 'brand' },
      }),
    );
  }
}
