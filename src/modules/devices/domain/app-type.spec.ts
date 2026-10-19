import { describe, expect, it } from 'vitest';
import { AppType } from './app-type.js';

describe('AppType', () => {
  it('normalizes case and surrounding spaces', () => {
    const result = AppType.parse('  Fire_TV ');

    expect(result.ok && result.value.value).toBe('fire_tv');
  });

  it.each(['', '   ', 'a'.repeat(33), 'fire-tv', 'lg tv', 'ios!'])('rejects %j', (input) => {
    const result = AppType.parse(input);

    expect(!result.ok && result.error.code).toBe('devices.invalid_app_type');
  });
});
