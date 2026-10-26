import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { SyncPlaylistStatusUseCase } from '../../../modules/playlists/index.js';
import { LegacyPlaylistsController } from './legacy-playlists.controller.js';

type Call = Parameters<SyncPlaylistStatusUseCase['execute']>[0];

function controller(answer: Awaited<ReturnType<SyncPlaylistStatusUseCase['execute']>>) {
  const calls: Call[] = [];
  const useCase = {
    execute: (input: Call) => {
      calls.push(input);
      return Promise.resolve(answer);
    },
  } as unknown as SyncPlaylistStatusUseCase;
  return { route: new LegacyPlaylistsController(useCase), calls };
}

const account = { status: 'Active', expiresAt: null, checkedAt: new Date() };

describe('PUT /api/edit_playlist', () => {
  it('passes only the status and expiry on, whatever else the app sends', async () => {
    const { route, calls } = controller({ ok: true, value: account });

    const reply = await route.editPlaylist({
      mac_address: 'CD-B9-99-27-E2-1F',
      id: 'pl-1',
      expiration_date: '1798761600',
      status: 'Active',
      auth: 'Active',
      fetched_at: '2026-10-26T13:00:00Z',
      name: 'Hijacked',
      url: 'http://evil.example/x.m3u',
    });

    expect(reply).toEqual({ status: 'success', msg: 'Playlist updated successfully', id: 'pl-1' });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!).sort()).toEqual(['expiresAt', 'mac', 'playlistId', 'status']);
    expect(calls[0]).toMatchObject({
      playlistId: 'pl-1',
      status: 'Active',
      expiresAt: '1798761600',
    });
    expect(calls[0]!.mac.value).toBe('cd:b9:99:27:e2:1f');
  });

  it('turns the app’s "Unknown" and "null" into no value', async () => {
    const { route, calls } = controller({ ok: true, value: account });

    await route.editPlaylist({
      mac_address: 'cd:b9:99:27:e2:1f',
      id: 'pl-1',
      status: 'Unknown',
      expiration_date: 'null',
    });

    expect(calls[0]).toMatchObject({ status: null, expiresAt: null });
  });

  it.each([
    [{ id: 'pl-1' }, 400],
    [{ mac_address: 'cd:b9:99:27:e2:1f' }, 400],
    [{ mac_address: 'cd:b9:99:27:e2:1f', id: 'demo' }, 400],
  ])('refuses %j with %i and calls nothing', async (body, httpStatus) => {
    const { route, calls } = controller({ ok: true, value: account });

    await expect(route.editPlaylist(body)).rejects.toMatchObject({ status: httpStatus });
    expect(calls).toHaveLength(0);
  });

  it('answers another device’s playlist like the old route: 403', async () => {
    const { PlaylistNotFoundError } =
      await import('../../../modules/playlists/domain/playlist.errors.js');
    const { route } = controller({
      ok: false,
      error: new PlaylistNotFoundError('Playlist not found'),
    });

    const refused = route.editPlaylist({
      mac_address: 'cd:b9:99:27:e2:1f',
      id: 'theirs',
      status: 'Active',
    });

    await expect(refused).rejects.toBeInstanceOf(HttpException);
    await expect(refused).rejects.toMatchObject({
      status: 403,
      response: { status: 'error', msg: "Sorry, you don't have permission" },
    });
  });
});
