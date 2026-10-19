import { DeviceSettings } from '../application/ports/device-settings.js';

/** The old backends' default trial. Replaced by each brand's own config in task TEN-05. */
const DEFAULT_TRIAL_DAYS = 7;

export class DefaultDeviceSettings extends DeviceSettings {
  trialDays(): Promise<number> {
    return Promise.resolve(DEFAULT_TRIAL_DAYS);
  }
}
