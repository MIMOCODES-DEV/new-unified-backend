import { describe, expect, it } from 'vitest';
import { Uid } from './uid.js';

describe('Uid (V4 device id the app generates)', () => {
  it('uppercases and trims, like the old backends', () => {
    const result = Uid.parse(' ab12cd ');

    expect(result.ok && result.value.value).toBe('AB12CD');
  });

  it.each(['', 'ABC12', 'ABC1234', 'AB-12C', 'ÄB12CD', undefined, null, 123456])(
    'rejects %j',
    (input) => {
      const result = Uid.parse(input);

      expect(!result.ok && result.error.code).toBe('devices.invalid_uid');
    },
  );

  it('compares case-insensitively', () => {
    const a = Uid.parse('ab12cd');
    const b = Uid.parse('AB12CD');
    if (!a.ok || !b.ok) throw new Error('bad fixture');

    expect(a.value.equals(b.value)).toBe(true);
  });
});
