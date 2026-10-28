import { describe, expect, it } from 'vitest';
import { backupHosts, backupUrls } from './backup-hosts.js';

const hosts = (values: string[]) => {
  const result = backupHosts(values);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('backupHosts (PL-5)', () => {
  it('keeps the host, and a scheme or port only when given', () => {
    expect(
      hosts([
        ' Line2.Example.com ',
        'line3.example.com:8080',
        'https://line4.example.com',
        'http://user:pass@line5.example.com:2095/get.php?username=u&password=p',
      ]),
    ).toEqual([
      'line2.example.com',
      'line3.example.com:8080',
      'https://line4.example.com',
      'http://line5.example.com:2095',
    ]);
  });

  it('drops blanks and duplicates', () => {
    expect(hosts(['a.example.com', '', 'A.example.com.', '  '])).toEqual(['a.example.com']);
  });

  it.each([
    'localhost',
    'ftp://a.example.com',
    'a.example.com:99999',
    'not a host',
    '-a.example.com',
  ])('refuses "%s", naming its place', (value) => {
    const result = backupHosts(['ok.example.com', value]);
    expect(!result.ok && result.error.details).toEqual({ field: 'backup.hosts', index: 1 });
  });

  it('allows 8 hosts and refuses a 9th', () => {
    const eight = Array.from({ length: 8 }, (_, i) => `m${i}.example.com`);

    expect(hosts(eight)).toHaveLength(8);
    expect(backupHosts([...eight, 'm8.example.com']).ok).toBe(false);
  });
});

describe('backupUrls (PL-5, cr backup_urls)', () => {
  it('swaps only the host of a get.php link: path, login and port stay', () => {
    expect(
      backupUrls('http://line.example.com:8080/get.php?username=u&password=p&type=m3u_plus', [
        'line2.example.com',
      ]),
    ).toEqual(['http://line2.example.com:8080/get.php?username=u&password=p&type=m3u_plus']);
  });

  it('works on an Xtream server link and keeps its trailing slash', () => {
    expect(backupUrls('http://line.example.com:8080/', ['line2.example.com'])).toEqual([
      'http://line2.example.com:8080/',
    ]);
  });

  it('uses the scheme or port a backup names', () => {
    expect(
      backupUrls('http://line.example.com:8080/list.m3u', [
        'https://line2.example.com',
        'line3.example.com:2095',
      ]),
    ).toEqual([
      'https://line2.example.com:8080/list.m3u',
      'http://line3.example.com:2095/list.m3u',
    ]);
  });

  it('keeps a link without a path without a trailing slash', () => {
    expect(backupUrls('http://line.example.com', ['line2.example.com'])).toEqual([
      'http://line2.example.com',
    ]);
  });

  it('is empty without a link, and skips the link itself', () => {
    expect(backupUrls(null, ['line2.example.com'])).toEqual([]);
    expect(backupUrls('http://line.example.com/x', ['line.example.com'])).toEqual([]);
  });
});
