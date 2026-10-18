import { describe, expect, it } from 'vitest';
import { HostName } from './host-name.js';

describe('HostName', () => {
  it.each([
    ['crtvplayer.com', 'crtvplayer.com'],
    ['CRTVPlayer.com', 'crtvplayer.com'],
    ['crtvplayer.com:443', 'crtvplayer.com'],
    ['crtvplayer.com.', 'crtvplayer.com'],
    ['cr7.localhost:4000', 'cr7.localhost'],
    ['localhost', 'localhost'],
  ])('normalizes %s to %s', (input, expected) => {
    const result = HostName.parse(input);

    expect(result.ok && result.value.value).toBe(expected);
  });

  it.each(['', ' ', 'bad host.com', '-bad.com', 'evil.com/path', 'a..b'])('rejects %j', (input) => {
    expect(HostName.parse(input).ok).toBe(false);
  });
});
