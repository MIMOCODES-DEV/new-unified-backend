/** Brand settings the device use cases read. Comes from the brand's config (task TEN-05). */
export abstract class DeviceSettings {
  abstract trialDays(): Promise<number>;
}
