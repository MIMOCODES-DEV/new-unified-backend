import { describe, expect, it } from 'vitest';
import { parseValue, patchFromPath } from '../../src/cli-args.js';

describe('CLI arguments', () => {
  it.each([
    ['true', true],
    ['3', 3],
    ['null', null],
    ['["https://a.com"]', ['https://a.com']],
    ['https://ibo.com', 'https://ibo.com'],
    ['IBO Player', 'IBO Player'],
  ])('reads %s as %j', (raw, value) => {
    expect(parseValue(raw)).toEqual(value);
  });

  it('turns a dotted setting name into a nested change', () => {
    expect(patchFromPath('features.maintenance', true)).toEqual({
      features: { maintenance: true },
    });
  });

  it('requires a setting name', () => {
    expect(() => patchFromPath('', true)).toThrow('setting name');
  });
});
