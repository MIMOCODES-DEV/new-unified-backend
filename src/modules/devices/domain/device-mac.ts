import { createHash } from 'node:crypto';
import { MacAddress } from '../../../shared/kernel/mac-address.js';

/**
 * MACs the apps send when they cannot read the real one: the emulator default the apps start with
 * (`52:54:00:12:34:57`, kept as is on Windows), its neighbours seen in the old data and purge jobs,
 * and the all-zero MAC. Many devices share each of them, so they never identify a device.
 */
export const FALLBACK_MACS: ReadonlySet<string> = new Set([
  '52:54:00:12:34:57',
  '52:54:00:12:34:58',
  '52:54:00:12:34:59',
  '00:00:00:00:00:00',
]);

/** False for a fallback MAC: such a device is found by its app device id or uid instead. */
export function isUsableMac(mac: MacAddress): boolean {
  return !FALLBACK_MACS.has(mac.value);
}

/**
 * The MAC stored for a device that has none: made from its app device id (or uid), so the same
 * id always gives the same MAC. Locally administered and unicast (first byte `x2`, `x6`, `xA`,
 * `xE`), so it never equals a factory MAC. `attempt` picks another MAC after a clash.
 */
export function madeUpMac(source: string, attempt = 0): MacAddress {
  const bytes = createHash('sha256').update(`${attempt}:${source}`).digest().subarray(0, 6);
  bytes[0] = (bytes[0]! & 0xfc) | 0x02;
  const mac = MacAddress.parse(bytes.toString('hex'));
  if (!mac.ok) throw new Error('A 12-digit hex string is always a valid MAC');
  return mac.value;
}
