import type { LegacyProfile } from '../../domain/legacy-profile.js';
import type { TrialDays } from '../../domain/trial-days.js';

/** Per-brand device settings (the brand's `tenantConfig`). The MongoDB version lives in infrastructure/. */
export abstract class DeviceSettings {
  /** The brand's trial length; the default (7 days) when the brand never set one. */
  abstract trialDays(): Promise<TrialDays>;
  abstract setTrialDays(days: TrialDays): Promise<void>;
  /** Which old backend's response shapes the brand's installed apps expect (`cr` by default). */
  abstract legacyProfile(): Promise<LegacyProfile>;
  abstract setLegacyProfile(profile: LegacyProfile): Promise<void>;
}
