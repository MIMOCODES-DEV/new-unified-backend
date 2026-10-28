import type { ReviewBuild } from '../../domain/review-build.js';

/** The brand settings device rules read (from the brand's config). */
export abstract class DeviceSettings {
  /** Length of a new device's trial (`trial.days`). */
  abstract trialDays(): Promise<number>;
  /** App builds in store review (`review.builds`); empty by default. */
  abstract reviewBuilds(): Promise<readonly ReviewBuild[]>;
  /** How many MAC switches a paid device may make (`macSwitch.maxPerDevice`); 1 by default. */
  abstract maxMacSwitches(): Promise<number>;
}
