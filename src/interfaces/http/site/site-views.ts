/**
 * What the brand site gets back about a device, its license and its playlists. Internal fields
 * (encrypted PIN, legacy bag, owner ids) are never sent.
 */

interface PlaylistLike {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly protected: boolean;
  readonly url?: string | null;
  readonly xtream?: {
    readonly server: string;
    readonly username: string;
    readonly password: string;
  } | null;
  readonly stalker?: {
    readonly portalName: string | null;
    readonly portalUrl: string;
    readonly fallbackUrl: string | null;
    readonly mac: string | null;
  } | null;
  readonly code?: { readonly code: string } | null;
  readonly epgUrl?: string | null;
  readonly backup?: { readonly enabled: boolean; readonly hosts: readonly string[] };
  readonly account?: { readonly status: string | null; readonly expiresAt: Date | null } | null;
  readonly createdAt?: Date;
  readonly hidden?: true;
}

/** A playlist on the device dashboard; a protected one shows only its name until unlocked. */
export function playlistView(p: PlaylistLike) {
  if (p.hidden) return { id: p.id, name: p.name, type: p.type, protected: true, hidden: true };
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    protected: p.protected,
    hidden: false,
    url: p.url ?? null,
    xtream: p.xtream ?? null,
    stalker: p.stalker ?? null,
    code: p.code?.code ?? null,
    epgUrl: p.epgUrl ?? null,
    backup: p.backup ?? { enabled: false, hosts: [] },
    account: p.account ?? null,
    createdAt: p.createdAt ?? null,
  };
}

/** The device itself: what the TV shows on its settings page, and whether it ever paid. */
export function deviceView(found: {
  paid: boolean;
  device: {
    id: string;
    macAddress: string;
    platform: string;
    deviceKey: string;
    parentPin: string | null;
    uid: string | null;
    lastSeenAt: Date;
    createdAt: Date;
    recovery?: { code: string | null; expiresAt: Date | null; enabled: boolean } | null;
    switch?: { from: string; at: Date; count: number } | null;
  };
}) {
  const d = found.device;
  return {
    id: d.id,
    macAddress: d.macAddress,
    platform: d.platform,
    deviceKey: d.deviceKey,
    parentalControl: d.parentPin !== null,
    parentPin: d.parentPin,
    uid: d.uid,
    paid: found.paid,
    // The owner's own recovery code (paid devices), and the last MAC switch.
    recovery: d.recovery
      ? { code: d.recovery.code, expiresAt: d.recovery.expiresAt, enabled: d.recovery.enabled }
      : null,
    lastSwitch: d.switch ? { from: d.switch.from, at: d.switch.at, count: d.switch.count } : null,
    lastSeenAt: d.lastSeenAt,
    createdAt: d.createdAt,
  };
}

/** What the device may do now: trial, yearly, lifetime, expired or revoked, and until when. */
export function licenseView(license: {
  state: string;
  active: boolean;
  endsAt: Date | null;
  license: { type: string; createdAt: Date } | null;
}) {
  return {
    state: license.state,
    active: license.active,
    endsAt: license.endsAt,
    type: license.license?.type ?? null,
    since: license.license?.createdAt ?? null,
  };
}
