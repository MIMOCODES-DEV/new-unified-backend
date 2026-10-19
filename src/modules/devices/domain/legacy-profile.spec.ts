import { describe, expect, it } from 'vitest';
import { DEFAULT_LEGACY_PROFILE, parseLegacyProfile } from './legacy-profile.js';

describe('legacy profile (which old backend a brand used to answer like)', () => {
  it('defaults to cr, the backend that served most brands', () => {
    expect(DEFAULT_LEGACY_PROFILE).toBe('cr');
  });

  it.each(['ibo', 'bob', 'cr', ' IBO '])('accepts %j', (input) => {
    const result = parseLegacyProfile(input);

    expect(result.ok && result.value).toBe(input.trim().toLowerCase());
  });

  it.each(['', 'x', 'iboplayer', 1, null])('rejects %j', (input) => {
    const result = parseLegacyProfile(input);

    expect(!result.ok && result.error.code).toBe('devices.invalid_legacy_profile');
  });
});
