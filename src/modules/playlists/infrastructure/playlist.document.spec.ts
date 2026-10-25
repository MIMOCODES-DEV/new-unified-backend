import { describe, expect, it } from 'vitest';
import type { Playlist } from '../domain/playlist.js';
import { toPlaylist, toPlaylistDocument } from './playlist.document.js';

const at = new Date('2026-10-25T10:00:00Z');

function playlist(overrides: Partial<Playlist>): Playlist {
  return {
    id: 'pl-1',
    deviceId: 'device-1',
    name: 'My list',
    type: 'm3u',
    url: 'http://provider.example/get.php?username=u&password=p',
    xtream: null,
    stalker: null,
    code: null,
    epgUrl: null,
    backup: { enabled: false, hosts: [] },
    protected: false,
    pinEnc: null,
    provider: null,
    addedBy: { via: 'app', resellerId: null },
    legacy: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

const xtream = { server: 'http://provider.example:8080', username: 'u', password: 'p' };
const stalker = {
  portalName: 'Portal',
  portalUrl: 'http://portal.example/c/',
  fallbackUrl: null,
  mac: '00:1a:79:00:00:01',
};
const code = { code: '123456789', expiresAt: null, status: null };

describe('playlist documents', () => {
  it.each([
    ['m3u', {}],
    ['xtream', { type: 'xtream', xtream }],
    ['stalker', { type: 'stalker', url: null, stalker }],
    ['code', { type: 'code', url: null, code }],
  ] as const)('stores a %s playlist with only its own part filled', (_type, overrides) => {
    const p = playlist(overrides);

    expect(toPlaylist(toPlaylistDocument(p))).toEqual(p);
  });

  it('keeps the url and the Xtream password as plain text', () => {
    const doc = toPlaylistDocument(playlist({ type: 'xtream', xtream }));

    expect(doc.url).toContain('password=p');
    expect(doc.xtream?.password).toBe('p');
  });

  it.each([
    ['an m3u playlist with Xtream parts', { xtream }],
    ['an xtream playlist without its parts', { type: 'xtream' }],
    ['a stalker playlist with a url', { type: 'stalker', stalker }],
    ['a code playlist without its code', { type: 'code', url: null }],
    ['a code that is not digits', { type: 'code', url: null, code: { ...code, code: 'abc' } }],
  ] as const)('refuses %s', (_case, overrides) => {
    expect(() => toPlaylistDocument(playlist(overrides as Partial<Playlist>))).toThrow();
  });

  it('allows up to 8 backup hosts', () => {
    const hosts = (n: number) => Array.from({ length: n }, (_, i) => `backup${i}.example`);

    expect(() =>
      toPlaylistDocument(playlist({ backup: { enabled: true, hosts: hosts(8) } })),
    ).not.toThrow();
    expect(() =>
      toPlaylistDocument(playlist({ backup: { enabled: true, hosts: hosts(9) } })),
    ).toThrow();
  });
});
