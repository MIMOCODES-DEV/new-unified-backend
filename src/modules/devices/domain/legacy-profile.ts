import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { InvalidLegacyProfileError } from './device.errors.js';

/**
 * Which old backend a brand used to run on. Installed apps of that brand expect its exact response
 * shapes (key order, field types), so the legacy routes answer "like ibo", "like bob" or "like cr".
 */
export type LegacyProfile = 'ibo' | 'bob' | 'cr';

/** cr-unified served most brands; ibo and bob each served their own. */
export const DEFAULT_LEGACY_PROFILE: LegacyProfile = 'cr';

const PROFILES = new Set<string>(['ibo', 'bob', 'cr']);

export function parseLegacyProfile(
  input: unknown,
): Result<LegacyProfile, InvalidLegacyProfileError> {
  const value = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!PROFILES.has(value)) {
    return err(new InvalidLegacyProfileError('Legacy profile must be ibo, bob or cr', { input }));
  }
  return ok(value as LegacyProfile);
}
