/** How playlist URLs are shaped for old apps: Xtream-style parts (`xc`) or the full URL (`general`). */
export type PlaylistProfile = 'xc' | 'general';

/** The old backend a brand came from: its old apps expect that backend's reply shapes. */
export const LEGACY_DIALECTS = ['ibo', 'bob', 'cr'] as const;
export type LegacyDialect = (typeof LEGACY_DIALECTS)[number];

/**
 * Per-brand behaviour, stored on the tenant in the central registry and available on every request.
 * Code that behaves differently per brand reads one of these flags — never `if (slug === 'x')`.
 */
export interface TenantSettings {
  readonly features: {
    /** Brand switched off for maintenance: its interfaces answer with a maintenance response. */
    readonly maintenance: boolean;
    /** Android `44*` app builds get playlists unshaped (raw URL). */
    readonly rawPlaylistsForAndroid44: boolean;
  };
  readonly legacy: {
    /**
     * Which old backend's replies the brand's old (pre-V4) apps expect: the same route answered
     * with different fields on each (`playlist_info`, the Roku and mobile logins).
     */
    readonly dialect: LegacyDialect;
    /** Legacy add/remove playlist calls arrive as a plain form instead of an envelope. */
    readonly plainBodyAddRemove: boolean;
    /** V4 `device_info` sends `rasp_enforce` with this value (cr brands: false); null = not sent. */
    readonly raspEnforce: boolean | null;
    /**
     * V4 `device_info` sends `real_time_notification`, `notification` and `notification_interval`
     * (the ibo and bob backends did; cr did not).
     */
    readonly notificationFields: boolean;
    /** `notification_interval`, as text like the old settings held it (bob: "1000000"). */
    readonly notificationInterval: string;
  };
  readonly playlistProfile: PlaylistProfile;
  /** Browser origins allowed to call this brand's API (`https://example.com`). */
  readonly corsOrigins: readonly string[];
  /** Public website of the brand, used in links sent to customers. */
  readonly frontendUrl: string | null;
  readonly partners: {
    /** App name this brand is registered under at StarArcs. */
    readonly starArcsAppName: string | null;
  };
}

/** A change to some settings; anything left out keeps its current value. */
export interface TenantSettingsPatch {
  features?: Partial<TenantSettings['features']>;
  legacy?: Partial<TenantSettings['legacy']>;
  playlistProfile?: PlaylistProfile;
  corsOrigins?: readonly string[];
  frontendUrl?: string | null;
  partners?: Partial<TenantSettings['partners']>;
}

/** Settings of a new brand, and of brands stored before a setting existed. */
export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  features: { maintenance: false, rawPlaylistsForAndroid44: false },
  legacy: {
    dialect: 'ibo',
    plainBodyAddRemove: false,
    raspEnforce: null,
    notificationFields: true,
    notificationInterval: '300',
  },
  playlistProfile: 'xc',
  corsOrigins: [],
  frontendUrl: null,
  partners: { starArcsAppName: null },
};

export function mergeTenantSettings(
  base: TenantSettings,
  patch: TenantSettingsPatch,
): TenantSettings {
  return {
    features: { ...base.features, ...patch.features },
    legacy: { ...base.legacy, ...patch.legacy },
    playlistProfile: patch.playlistProfile ?? base.playlistProfile,
    corsOrigins: [...(patch.corsOrigins ?? base.corsOrigins)],
    frontendUrl: patch.frontendUrl === undefined ? base.frontendUrl : patch.frontendUrl,
    partners: { ...base.partners, ...patch.partners },
  };
}
