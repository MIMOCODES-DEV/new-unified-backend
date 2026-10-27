/**
 * One activation (or revoke) of a device at a time, across every server: a Redis lock per device,
 * bound at the process root. Fails closed: without Redis nothing is activated.
 */
export abstract class LicenseLock {
  abstract withDevice<T>(deviceId: string, fn: () => Promise<T>): Promise<T>;
}
