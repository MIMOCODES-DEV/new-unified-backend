/** The brand settings device rules read (from the brand's config). */
export abstract class DeviceSettings {
  /** Length of a new device's trial (`trial.days`). */
  abstract trialDays(): Promise<number>;
}
