import { describe, expect, it } from 'vitest';
import { hostMoveBetween } from './host-move.js';

describe('a provider move learned from one edit (DOM-1)', () => {
  it('is the host change when nothing else changed', () => {
    expect(
      hostMoveBetween(
        'http://line.old.example:8080/get.php?username=a&password=b&type=m3u',
        'http://line.new.example:8080/get.php?username=a&password=b&type=m3u',
      ),
    ).toEqual({
      fromHost: 'line.old.example:8080',
      toHost: 'line.new.example:8080',
      fromScheme: 'http',
      toScheme: 'http',
    });
  });

  it('stores hosts lowercase, with the port unless it is the default one', () => {
    expect(
      hostMoveBetween('HTTP://Line.Old.Example:80/live/', 'https://LINE.new.example:443/live'),
    ).toEqual({
      fromHost: 'line.old.example',
      toHost: 'line.new.example',
      fromScheme: 'http',
      toScheme: 'https',
    });
    expect(hostMoveBetween('http://a.example/x', 'http://a.example:8080/x')).toMatchObject({
      fromHost: 'a.example',
      toHost: 'a.example:8080',
    });
  });

  it('allows new login values (a provider that moves often reissues them)', () => {
    expect(
      hostMoveBetween(
        'http://old.example/get.php?username=a&password=b',
        'http://new.example/get.php?username=c&password=d',
      ),
    ).not.toBeNull();
  });

  it('is not a move when more than the host changed, or nothing did', () => {
    const before = 'http://old.example/get.php?username=a&password=b';
    for (const after of [
      'http://new.example/other.php?username=a&password=b', // another path
      'http://new.example/get.php?username=a', // other parameters
      'http://old.example/get.php?username=a&password=c', // same host
      'ftp://new.example/get.php?username=a&password=b', // not a web link
      'not a link at all',
    ]) {
      expect(hostMoveBetween(before, after)).toBeNull();
    }
    expect(hostMoveBetween(null, before)).toBeNull();
  });
});
