/**
 * App type rules:
 * - One fixed list: the values the old V4 routes and controllers use.
 * - Stored lowercase. Input is lowercased first, so `iOS` → `ios`.
 * - The old spelling `androidtv` is accepted and stored as `android_tv`.
 * - `unknown` exists for migrated rows that had no app type.
 * - Anything else is refused.
 */
import { DomainError } from '../../../shared/kernel/domain-error.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';

export const APP_TYPES = [
  'android',
  'android_tv',
  'fire_tv',
  'samsung',
  'lg',
  'vidaa',
  'zeasn',
  'philips',
  'titanos',
  'vegaos',
  'windows',
  'macos',
  'linux',
  'ios',
  'tvos',
  'roku',
  'unknown',
] as const;

export type AppType = (typeof APP_TYPES)[number];

const ALIASES: Readonly<Record<string, AppType>> = { androidtv: 'android_tv' };

export class InvalidAppTypeError extends DomainError {
  readonly code = 'devices.invalid_app_type';
}

export function parseAppType(input: string): Result<AppType, InvalidAppTypeError> {
  const value = input.trim().toLowerCase();
  const appType = ALIASES[value] ?? APP_TYPES.find((t) => t === value);
  if (!appType) {
    return err(new InvalidAppTypeError('Unknown app type', { input, allowed: APP_TYPES }));
  }
  return ok(appType);
}
