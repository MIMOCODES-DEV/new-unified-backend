import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { InvalidPlaylistError } from '../../domain/playlist.errors.js';
import { moveProviderHost, providerHost } from '../../domain/provider-host.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface MoveProviderHostInput {
  /** The provider's old host, as plain text: `line.example.com` or `line.example.com:8080`. */
  from: string;
  /** Not needed to count only (the store's count-domain-updates). */
  to?: string;
  /** Every playlist of the brand (staff), or only the devices with these MACs (a reseller). */
  scope:
    { readonly kind: 'brand' } | { readonly kind: 'devices'; readonly macs: readonly MacAddress[] };
  /** Count what would change and change nothing. */
  countOnly: boolean;
  /** Change at most this many (a gradual move); the rest stay for a later run. */
  limit?: number;
}

export interface MoveProviderHostReport {
  /** Playlists with a link on the old host. */
  matched: number;
  changed: number;
  /** Left as they were: the device already had the same playlist on the new host. */
  skipped: number;
}

/**
 * PL-8: a provider moved to another host; every playlist on the old host follows. Only the calling
 * brand's playlists are read (its own database), the host is plain text (the old route ran the
 * caller's text as a regex and replaced it anywhere in the link), and only the host changes.
 */
@Injectable()
export class MoveProviderHostUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: MoveProviderHostInput,
  ): Promise<Result<MoveProviderHostReport, InvalidPlaylistError>> {
    const from = providerHost(input.from, 'from');
    if (!from.ok) return from;
    // Counting matches on `from` alone: moving to the same host matches the same playlists.
    const to =
      input.to === undefined && input.countOnly ? from : providerHost(input.to ?? '', 'to');
    if (!to.ok) return to;
    if (
      input.to !== undefined &&
      from.value.host === to.value.host &&
      from.value.port === to.value.port
    ) {
      return err(new InvalidPlaylistError('The new host is the old host', { field: 'to' }));
    }

    let deviceIds: string[] | null = null;
    if (input.scope.kind === 'devices') {
      const found = await Promise.all(input.scope.macs.map((mac) => this.devices.findIdByMac(mac)));
      deviceIds = found.filter((id): id is string => id !== null);
      if (deviceIds.length === 0) return ok({ matched: 0, changed: 0, skipped: 0 });
    }

    const candidates = await this.playlists.listOnHost(from.value.host, deviceIds);
    const moves = candidates
      .map((playlist) => moveProviderHost(playlist, from.value, to.value))
      .filter((moved) => moved !== null);
    const report: MoveProviderHostReport = { matched: moves.length, changed: 0, skipped: 0 };
    if (input.countOnly) return ok(report);

    const now = this.clock.now();
    for (const moved of moves.slice(0, input.limit ?? moves.length)) {
      const saved = await this.playlists.update({ ...moved, updatedAt: now });
      if (saved === 'updated') report.changed += 1;
      else report.skipped += 1;
    }
    return ok(report);
  }
}
