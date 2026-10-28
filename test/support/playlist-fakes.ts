import { PinCipher } from '../../src/modules/playlists/application/ports/pin-cipher.js';
import { PlaylistDevices } from '../../src/modules/playlists/application/ports/playlist-devices.js';
import type { PlaylistRepository } from '../../src/modules/playlists/application/ports/playlist.repository.js';
import type { Playlist } from '../../src/modules/playlists/domain/playlist.js';
import type { MacAddress } from '../../src/shared/kernel/mac-address.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The `<type>_once_per_device` unique indexes: what makes two playlists of a device the same. */
function sameKey(p: Playlist): string {
  switch (p.type) {
    case 'm3u':
      return `m3u|${p.deviceId}|${p.url}`;
    case 'xtream':
      return `xtream|${p.deviceId}|${p.xtream?.server}|${p.xtream?.username}`;
    case 'stalker':
      return `stalker|${p.deviceId}|${p.stalker?.portalUrl}|${p.stalker?.mac}`;
    case 'code':
      return `code|${p.deviceId}|${p.code?.code}`;
  }
}

export class InMemoryPlaylistRepository implements PlaylistRepository {
  readonly items = new Map<string, Playlist>();

  /** `base`, or `base 2`, `base 3`, … when the device already has that name (names are unique). */
  freeName(deviceId: string, base = 'List'): string {
    const taken = (name: string) =>
      [...this.items.values()].some(
        (p) => p.deviceId === deviceId && p.name.toLowerCase() === name.toLowerCase(),
      );
    let name = base;
    for (let i = 2; taken(name); i++) name = `${base} ${i}`;
    return name;
  }

  private clashes(playlist: Playlist): 'duplicate' | 'name_taken' | null {
    const others = [...this.items.values()].filter((p) => p.id !== playlist.id);
    const key = sameKey(playlist);
    if (others.some((p) => sameKey(p) === key)) return 'duplicate';
    // Same rule as the case-insensitive name_once_per_device index.
    const name = playlist.name.toLowerCase();
    const named = others.some(
      (p) => p.deviceId === playlist.deviceId && p.name.toLowerCase() === name,
    );
    return named ? 'name_taken' : null;
  }

  async findById(id: string): Promise<Playlist | null> {
    await tick();
    return this.items.get(id) ?? null;
  }
  async listByDevice(deviceId: string): Promise<Playlist[]> {
    await tick();
    return [...this.items.values()]
      .filter((p) => p.deviceId === deviceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async listOnHost(host: string, deviceIds: readonly string[] | null): Promise<Playlist[]> {
    await tick();
    const hostOf = (link: string | null | undefined) => {
      try {
        return link ? new URL(link).hostname : null;
      } catch {
        return null;
      }
    };
    return [...this.items.values()]
      .filter((p) => !deviceIds || deviceIds.includes(p.deviceId))
      .filter((p) =>
        [p.url, p.xtream?.server, p.stalker?.portalUrl, p.stalker?.fallbackUrl].some(
          (link) => hostOf(link) === host,
        ),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async findByLegacyId(legacyId: string): Promise<Playlist | null> {
    await tick();
    return [...this.items.values()].find((p) => p.legacy?.id === legacyId) ?? null;
  }
  async insert(playlist: Playlist): Promise<'inserted' | 'duplicate' | 'name_taken'> {
    await tick();
    const clash = this.clashes(playlist);
    if (clash) return clash;
    this.items.set(playlist.id, playlist);
    return 'inserted';
  }
  async update(playlist: Playlist): Promise<'updated' | 'missing' | 'duplicate' | 'name_taken'> {
    await tick();
    if (!this.items.has(playlist.id)) return 'missing';
    const clash = this.clashes(playlist);
    if (clash) return clash;
    this.items.set(playlist.id, playlist);
    return 'updated';
  }
  async delete(id: string): Promise<boolean> {
    await tick();
    return this.items.delete(id);
  }
  async deleteByDevice(deviceId: string): Promise<number> {
    await tick();
    const ids = [...this.items.values()].filter((p) => p.deviceId === deviceId).map((p) => p.id);
    ids.forEach((id) => this.items.delete(id));
    return ids.length;
  }
}

/** Devices by MAC, and the playlist count changes reported for each device. */
export class FakePlaylistDevices extends PlaylistDevices {
  readonly byMac = new Map<string, string>();
  readonly counts = new Map<string, number>();

  findIdByMac(mac: MacAddress): Promise<string | null> {
    return Promise.resolve(this.byMac.get(mac.value) ?? null);
  }
  playlistCountChanged(deviceId: string, delta: number): Promise<void> {
    this.counts.set(deviceId, (this.counts.get(deviceId) ?? 0) + delta);
    return Promise.resolve();
  }
}

/** Reversible stand-in for the brand-key cipher: enough to tell PINs apart in tests. */
export class FakePinCipher extends PinCipher {
  encrypt(pin: string): Promise<string> {
    return Promise.resolve(`enc(${[...pin].reverse().join('')})`);
  }
  decrypt(pinEnc: string): Promise<string> {
    return Promise.resolve([...pinEnc.slice(4, -1)].reverse().join(''));
  }
}
