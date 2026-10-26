/** A device key: 6 digits. Not unique; always checked together with the MAC. */
export function isValidDeviceKey(key: string): boolean {
  return /^\d{6}$/.test(key);
}

/** Every new device starts with parental control on and this PIN, on every app and brand. */
export const DEFAULT_PARENT_PIN = '0000';

/** A parent PIN: 4 digits. Kept as entered: the apps get it back and check it themselves. */
export function isValidParentPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
