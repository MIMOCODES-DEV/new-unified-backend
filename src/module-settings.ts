import {
  type CustomerMailer,
  type CustomerDevices,
  CustomersModule,
} from './modules/customers/index.js';
import {
  ApplyLicenseUseCase,
  ChangePlaylistCountUseCase,
  type DeviceSettings,
  DevicesModule,
  FindDeviceByIdUseCase,
  FindDeviceByRecoveryCodeUseCase,
  FindDeviceUseCase,
  DeleteStaleTrialDeviceUseCase,
  LinkDeviceToCustomerUseCase,
  ListCustomerDevicesUseCase,
  UnlinkDeviceFromCustomerUseCase,
  ListStaleTrialDevicesUseCase,
  RecoverDeviceUseCase,
  SetRecoveryCodeUseCase,
  SwitchDeviceMacUseCase,
} from './modules/devices/index.js';
import {
  type LicensedDevices,
  type LicensedPlaylists,
  type LicenseLock,
  LicensingModule,
  type MacSwitchOutcome,
  type RecoveryOutcome,
} from './modules/licensing/index.js';
import {
  ApprovedHostMovesUseCase,
  DomainMigrationsModule,
  type MoveDevices,
  ReportHostMoveUseCase,
} from './modules/domain-migrations/index.js';
import {
  DeleteDevicePlaylistsUseCase,
  type MacOnlyRateLimit,
  MoveDevicePlaylistsUseCase,
  PLAYLIST_PIN_KEY_SECRET,
  type PlaylistBrand,
  type PlaylistDevices,
  type PlaylistHostMoves,
  type PlaylistPinKey,
  PlaylistsModule,
} from './modules/playlists/index.js';
import {
  GetTenantConfigUseCase,
  GetTenantSecretUseCase,
  TenantsModule,
} from './modules/tenants/index.js';
import { Logger } from '@nestjs/common';
import { SmtpCustomerMailer } from './interfaces/http/accounts/smtp-customer.mailer.js';
import { AppConfig } from './shared/config/app-config.js';
import { MacAddress } from './shared/kernel/mac-address.js';
import { RedisLock } from './shared/redis/redis-lock.js';
import { RedisRateLimiter } from './shared/redis/redis-rate-limiter.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

/** An activation holds its device this long at most; a second one waits for it. */
const LICENSE_LOCK = { ttlMs: 10_000, waitMs: 5_000 };

/** Adding or deleting playlists by MAC alone: calls per IP and brand, per 10 minutes. */
const MAC_ONLY_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

/**
 * Feature modules wired to each other and to the brand config. A module may not import another
 * module, so what each one needs from another is bound here, once for every process.
 */
export const DevicesWithBrandConfig = DevicesModule.forRootAsync({
  imports: [TenantsModule],
  settings: {
    inject: [GetTenantConfigUseCase, TenantContext],
    useFactory: (getConfig: GetTenantConfigUseCase, context: TenantContext): DeviceSettings => ({
      trialDays: async () => (await getConfig.execute(context.current)).trial.days,
      reviewBuilds: async () => (await getConfig.execute(context.current)).review.builds,
      maxMacSwitches: async () => (await getConfig.execute(context.current)).macSwitch.maxPerDevice,
    }),
  },
});

/** Provider moves count reports from paid devices only. */
export const DomainMigrationsWithDevices = DomainMigrationsModule.forRootAsync({
  imports: [DevicesWithBrandConfig],
  devices: {
    inject: [FindDeviceByIdUseCase],
    useFactory: (findDevice: FindDeviceByIdUseCase): MoveDevices => ({
      isPaid: async (deviceId) => {
        const found = await findDevice.execute(deviceId);
        return found.ok && found.value.paid;
      },
    }),
  },
});

const hostMovesLogger = new Logger('ProviderMoves');

/**
 * Playlists find devices by MAC, keep the trial devices' playlist counters in step, encrypt PINs
 * with the brand secret `playlists.pinKey`, shape replies by the brand's settings and config, report
 * link edits as provider moves and serve the approved ones.
 */
export const PlaylistsWithDevices = PlaylistsModule.forRootAsync({
  imports: [DevicesWithBrandConfig, TenantsModule, DomainMigrationsWithDevices],
  devices: {
    inject: [FindDeviceUseCase, ChangePlaylistCountUseCase],
    useFactory: (
      findDevice: FindDeviceUseCase,
      changeCount: ChangePlaylistCountUseCase,
    ): PlaylistDevices => ({
      findIdByMac: async (mac) => {
        const found = await findDevice.execute(mac);
        return found.ok ? found.value.device.id : null;
      },
      playlistCountChanged: (deviceId, delta) => changeCount.execute({ deviceId, delta }),
    }),
  },
  pinKey: {
    inject: [GetTenantSecretUseCase, TenantContext],
    useFactory: (getSecret: GetTenantSecretUseCase, context: TenantContext): PlaylistPinKey => ({
      current: () => getSecret.execute(context.current.id, PLAYLIST_PIN_KEY_SECRET),
    }),
  },
  brand: {
    inject: [GetTenantConfigUseCase, TenantContext],
    useFactory: (getConfig: GetTenantConfigUseCase, context: TenantContext): PlaylistBrand => ({
      replyProfile: () => Promise.resolve(context.current.settings.playlistProfile),
      rawForAndroid44: () =>
        Promise.resolve(context.current.settings.features.rawPlaylistsForAndroid44),
      demoUrl: async () => (await getConfig.execute(context.current)).app.demoUrl,
    }),
  },
  macOnlyRateLimit: {
    inject: [RedisRateLimiter, TenantContext],
    useFactory: (limiter: RedisRateLimiter, context: TenantContext): MacOnlyRateLimit => ({
      take: (ip) => limiter.take(`playlists:mac-only:${context.current.id}:${ip}`, MAC_ONLY_LIMIT),
    }),
  },
  hostMoves: {
    inject: [ReportHostMoveUseCase, ApprovedHostMovesUseCase, TenantContext],
    useFactory: (
      report: ReportHostMoveUseCase,
      approved: ApprovedHostMovesUseCase,
      context: TenantContext,
    ): PlaylistHostMoves => ({
      linkChanged: async (change) => {
        // Bookkeeping next to a person's own edit: a failure here must not fail the edit.
        try {
          await report.execute({ tenantId: context.current.id, ...change });
        } catch (error) {
          hostMovesLogger.warn(`Could not record a provider move: ${(error as Error).message}`);
        }
      },
      approved: () => approved.execute(),
    }),
  },
});

/** A devices-side switch refusal, as licensing sees it. */
const SWITCH_REFUSALS: Record<string, Exclude<MacSwitchOutcome['status'], 'done'>> = {
  'devices.not_found': 'not_found',
  'kernel.invalid_mac_address': 'invalid_mac',
  'devices.usable_mac_required': 'invalid_mac',
  'devices.same_mac': 'same_mac',
  'devices.mac_switch_limit': 'limit_reached',
  'devices.new_mac_not_registered': 'not_registered',
  'devices.mac_in_use': 'mac_taken',
};

/** A devices-side recovery refusal, as licensing sees it. */
const RECOVERY_REFUSALS: Record<string, Exclude<RecoveryOutcome['status'], 'done'>> = {
  'devices.not_found': 'not_found',
  'kernel.invalid_mac_address': 'invalid_mac',
  'devices.usable_mac_required': 'invalid_mac',
  'devices.same_mac': 'same_mac',
  'devices.new_mac_not_registered': 'not_registered',
  'devices.mac_in_use': 'mac_taken',
};

/**
 * Licensing finds devices, moves a trial device to devices on payment, locks per device, moves a
 * license to a new MAC (with the new TV's trial playlists), recovers a device on a new TV with a
 * code, and removes stale trial devices with their playlists.
 */
export const LicensingWithDevices = LicensingModule.forRootAsync({
  imports: [DevicesWithBrandConfig, PlaylistsWithDevices],
  devices: {
    inject: [
      FindDeviceByIdUseCase,
      ApplyLicenseUseCase,
      SwitchDeviceMacUseCase,
      SetRecoveryCodeUseCase,
      FindDeviceByRecoveryCodeUseCase,
      RecoverDeviceUseCase,
      ListStaleTrialDevicesUseCase,
      DeleteStaleTrialDeviceUseCase,
    ],
    useFactory: (
      findDevice: FindDeviceByIdUseCase,
      applyLicense: ApplyLicenseUseCase,
      switchMac: SwitchDeviceMacUseCase,
      setRecoveryCode: SetRecoveryCodeUseCase,
      findByRecoveryCode: FindDeviceByRecoveryCodeUseCase,
      recover: RecoverDeviceUseCase,
      listStale: ListStaleTrialDevicesUseCase,
      deleteStale: DeleteStaleTrialDeviceUseCase,
    ): LicensedDevices => ({
      find: async (deviceId) => {
        const found = await findDevice.execute(deviceId);
        if (!found.ok) return null;
        const { paid, device } = found.value;
        return paid
          ? { id: device.id, paid, trialEndsAt: null, currentLicenseId: device.currentLicenseId }
          : { id: device.id, paid, trialEndsAt: device.trialEndsAt, currentLicenseId: null };
      },
      markPaid: async (deviceId, paidBy) => {
        const applied = await applyLicense.execute({ deviceId, ...paidBy });
        if (applied.ok) return 'done';
        return applied.error.code === 'devices.not_found' ? 'not_found' : 'conflict';
      },
      switchMac: async (deviceId, newMac, takeOver) => {
        const switched = await switchMac.execute({ deviceId, newMac, takeOver });
        if (!switched.ok) return { status: SWITCH_REFUSALS[switched.error.code] ?? 'not_found' };
        const { device, absorbedTrialId } = switched.value;
        const record = device.switch!;
        return {
          status: 'done',
          from: record.from,
          to: record.to,
          at: record.at,
          count: record.count,
          absorbedTrialId,
        };
      },
      setRecoveryCode: async (deviceId, code, expiresAt) => {
        const set = await setRecoveryCode.execute({ deviceId, code, expiresAt });
        if (set.ok) return 'done';
        return set.error.code === 'devices.recovery_code_taken' ? 'taken' : 'not_found';
      },
      findByRecoveryCode: async (code) => {
        const found = await findByRecoveryCode.execute(code);
        return found.ok ? { id: found.value.id, expiresAt: found.value.recovery!.expiresAt } : null;
      },
      recover: async (deviceId, newMac, removeTrial) => {
        const recovered = await recover.execute({ deviceId, newMac, removeTrial });
        if (!recovered.ok) {
          return { status: RECOVERY_REFUSALS[recovered.error.code] ?? 'not_found' };
        }
        const { device, removedTrialId } = recovered.value;
        const record = device.recovery!;
        return {
          status: 'done',
          from: record.recoveredFrom!,
          to: device.macAddress,
          at: record.recoveredAt!,
          removedTrialId,
        };
      },
      listStaleTrials: async (rule, limit) =>
        (await listStale.execute({ ...rule, limit })).map((t) => ({
          id: t.id,
          macAddress: t.macAddress,
          trialEndsAt: t.trialEndsAt,
          lastSeenAt: t.lastSeenAt,
        })),
      deleteStaleTrial: (deviceId, rule, removePlaylists) =>
        deleteStale.execute({ deviceId, ...rule, removePlaylists }),
    }),
  },
  playlists: {
    inject: [MoveDevicePlaylistsUseCase, DeleteDevicePlaylistsUseCase],
    useFactory: (
      move: MoveDevicePlaylistsUseCase,
      deleteAll: DeleteDevicePlaylistsUseCase,
    ): LicensedPlaylists => ({
      moveAll: (fromDeviceId, toDeviceId) => move.execute({ fromDeviceId, toDeviceId }),
      deleteAll: (deviceId) => deleteAll.execute(deviceId),
    }),
  },
  lock: {
    inject: [RedisLock, TenantContext],
    useFactory: (lock: RedisLock, context: TenantContext): LicenseLock => ({
      withDevice: (deviceId, fn) =>
        lock.withLock(`licensing:device:${context.current.id}:${deviceId}`, LICENSE_LOCK, fn),
    }),
  },
});

/** The secret holding a brand's SMTP server, e.g. `smtps://user:password@smtp.example.com:465`. */
const SMTP_URL_SECRET = 'smtp.url';

const LINK_REFUSALS = {
  'devices.device_key_mismatch': 'mismatch',
  'devices.not_paid': 'not_paid',
  'devices.linked_elsewhere': 'linked_elsewhere',
} as const;

/**
 * Customers link the brand's paid devices by MAC and device key, and get their emails from the
 * brand's own SMTP server and sender, with links to the brand site.
 */
export const CustomersWithDevices = CustomersModule.forRootAsync({
  imports: [DevicesWithBrandConfig, TenantsModule],
  devices: {
    inject: [
      LinkDeviceToCustomerUseCase,
      UnlinkDeviceFromCustomerUseCase,
      ListCustomerDevicesUseCase,
    ],
    useFactory: (
      link: LinkDeviceToCustomerUseCase,
      unlink: UnlinkDeviceFromCustomerUseCase,
      list: ListCustomerDevicesUseCase,
    ): CustomerDevices => {
      const view = (d: { id: string; macAddress: string; platform: string; lastSeenAt: Date }) => ({
        id: d.id,
        macAddress: d.macAddress,
        platform: d.platform,
        lastSeenAt: d.lastSeenAt,
      });
      return {
        link: async (rawMac, key, customerId) => {
          const mac = MacAddress.parse(rawMac);
          if (!mac.ok) return { status: 'mismatch' };
          const linked = await link.execute({ mac: mac.value, key, customerId });
          if (linked.ok) return { status: 'linked', device: view(linked.value) };
          const code = linked.error.code;
          return { status: LINK_REFUSALS[code] ?? 'mismatch' };
        },
        unlink: async (deviceId, customerId) => (await unlink.execute({ deviceId, customerId })).ok,
        listFor: async (customerId) => (await list.execute(customerId)).map(view),
      };
    },
  },
  mailer: {
    inject: [GetTenantConfigUseCase, GetTenantSecretUseCase, TenantContext, AppConfig],
    useFactory: (
      getConfig: GetTenantConfigUseCase,
      getSecret: GetTenantSecretUseCase,
      context: TenantContext,
      config: AppConfig,
    ): CustomerMailer =>
      new SmtpCustomerMailer(async () => {
        const brand = context.current;
        return {
          brandName: brand.name,
          smtpUrl: await getSecret.execute(brand.id, SMTP_URL_SECRET),
          from: (await getConfig.execute(brand)).email.from,
          siteUrl: brand.settings.frontendUrl,
        };
      }, config.isProduction),
  },
});
