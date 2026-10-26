import { describe, expect, it } from 'vitest';
import { epgUrl, playlistContent, playlistName } from './playlist-content.js';
import { parseXtreamUrl, xtreamPlaylistUrl } from './xtream-url.js';

const content = (source: Parameters<typeof playlistContent>[0]) => {
  const result = playlistContent(source);
  if (!result.ok) throw result.error;
  return result.value;
};
const errorField = (source: Parameters<typeof playlistContent>[0]) => {
  const result = playlistContent(source);
  return result.ok ? null : result.error.details?.field;
};

describe('parseXtreamUrl', () => {
  it.each([
    [
      'http://line.example:8080/get.php?username=u1&password=p1&type=m3u_plus&output=ts',
      'http://line.example:8080/',
    ],
    ['https://line.example/play/list?username=u1&password=p1', 'https://line.example/'],
    ['http://line.example/panel/playlist?USERNAME=u1&Password=p1', 'http://line.example/panel/'],
    ['http://line.example/get.php/?username=u1&password=p1', 'http://line.example/'],
  ])('reads %s', (link, server) => {
    expect(parseXtreamUrl(link)).toEqual({ server, username: 'u1', password: 'p1' });
  });

  it.each([
    'http://line.example/list.m3u',
    'http://line.example/get.php?username=u1',
    'http://line.example/other.php?username=u1&password=p1',
    'ftp://line.example/get.php?username=u1&password=p1',
    'not a link',
  ])('is null for %s', (link) => {
    expect(parseXtreamUrl(link)).toBeNull();
  });

  it('decodes the password and encodes it again when the link is rebuilt', () => {
    const login = parseXtreamUrl('http://h.example/get.php?username=u&password=a%26b');
    expect(login?.password).toBe('a&b');
    expect(parseXtreamUrl(xtreamPlaylistUrl(login!))).toEqual(login);
  });
});

describe('playlistContent (PL-1)', () => {
  it('stores an Xtream link as xtream, parsed once, with the link kept as typed', () => {
    const link = ' http://line.example:8080/get.php?username=u1&password=p1&type=m3u_plus ';

    expect(content({ kind: 'link', url: link })).toEqual({
      type: 'xtream',
      url: link.trim(),
      xtream: { server: 'http://line.example:8080/', username: 'u1', password: 'p1' },
      stalker: null,
      code: null,
    });
  });

  it('stores another link as m3u, with only url filled', () => {
    expect(content({ kind: 'link', url: 'https://cdn.example/list.m3u8' })).toEqual({
      type: 'm3u',
      url: 'https://cdn.example/list.m3u8',
      xtream: null,
      stalker: null,
      code: null,
    });
  });

  it('stores Xtream typed as fields, with the get.php link made from them', () => {
    const result = content({
      kind: 'xtream',
      server: 'http://line.example:8080',
      username: ' u1 ',
      password: 'p 1',
    });

    expect(result.type).toBe('xtream');
    expect(result.xtream).toEqual({
      server: 'http://line.example:8080/',
      username: 'u1',
      password: 'p 1',
    });
    expect(parseXtreamUrl(result.url!)).toEqual(result.xtream);
  });

  it('stores a Stalker portal with only stalker filled and the MAC normalized', () => {
    expect(
      content({
        kind: 'stalker',
        portalUrl: 'http://portal.example/c/',
        portalName: ' Main ',
        fallbackUrl: '',
        mac: '00-1A-79-AA-BB-CC',
      }),
    ).toEqual({
      type: 'stalker',
      url: null,
      xtream: null,
      stalker: {
        portalName: 'Main',
        portalUrl: 'http://portal.example/c/',
        fallbackUrl: null,
        mac: '00:1a:79:aa:bb:cc',
      },
      code: null,
    });
  });

  it('stores a provider code with only code filled', () => {
    expect(content({ kind: 'code', code: ' 482915 ' })).toEqual({
      type: 'code',
      url: null,
      xtream: null,
      stalker: null,
      code: { code: '482915', expiresAt: null, status: null },
    });
  });

  it.each([
    [{ kind: 'link', url: 'ftp://x.example/list' }, 'url'],
    [{ kind: 'link', url: '' }, 'url'],
    [{ kind: 'xtream', server: 'line.example', username: 'u', password: 'p' }, 'server'],
    [{ kind: 'xtream', server: 'http://line.example', username: ' ', password: 'p' }, 'username'],
    [{ kind: 'xtream', server: 'http://line.example', username: 'u', password: '' }, 'password'],
    [{ kind: 'stalker', portalUrl: 'portal' }, 'portalUrl'],
    [{ kind: 'stalker', portalUrl: 'http://p.example', fallbackUrl: 'nope' }, 'fallbackUrl'],
    [{ kind: 'stalker', portalUrl: 'http://p.example', mac: 'zz' }, 'mac'],
    [{ kind: 'code', code: '12ab' }, 'code'],
  ] as const)('refuses %j, naming %s', (source, field) => {
    expect(errorField(source)).toBe(field);
  });
});

describe('playlistName and epgUrl', () => {
  it('trims the name and refuses an empty or too long one', () => {
    expect(playlistName('  My TV ')).toEqual({ ok: true, value: 'My TV' });
    expect(playlistName('   ').ok).toBe(false);
    expect(playlistName('x'.repeat(101)).ok).toBe(false);
  });

  it('accepts no EPG or an http link, and refuses anything else', () => {
    expect(epgUrl(null)).toEqual({ ok: true, value: null });
    expect(epgUrl(' ')).toEqual({ ok: true, value: null });
    expect(epgUrl('http://epg.example/xml')).toEqual({ ok: true, value: 'http://epg.example/xml' });
    expect(epgUrl('epg').ok).toBe(false);
  });
});
