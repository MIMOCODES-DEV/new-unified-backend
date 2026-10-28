/**
 * What provider moves need from the devices module, bound at the process root
 * (src/module-settings.ts): a module may not import another module.
 */
export abstract class MoveDevices {
  /** Whether the device is in the current brand's `devices` (paid at least once). */
  abstract isPaid(deviceId: string): Promise<boolean>;
}
