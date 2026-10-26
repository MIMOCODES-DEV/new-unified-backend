/**
 * V4 device token rules (the Bearer token old apps get from device_login):
 * - Format, same as all 3 old backends: base64( base64("<deviceId>,<mac>") XOR key ).
 * - It is NOT signed: anyone who knows the key can make one. So after decoding we always load
 *   the device and check that its id AND its MAC match the token (the old code did the same).
 * - A tampered token decodes to garbage in the old code; here it returns null.
 * Test vectors: test/fixtures/legacy/codecs/xor-token.json (from the real old code).
 */
import { MacAddress } from '../../../shared/kernel/mac-address.js';

const DEVICE_ID = /^[A-Za-z0-9-]{1,64}$/;

function xor(text: string, key: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function encodeDeviceToken(key: string, deviceId: string, mac: string): string {
  const inner = Buffer.from(`${deviceId},${mac}`, 'utf8').toString('base64');
  return Buffer.from(xor(inner, key), 'utf8').toString('base64');
}

/** The device id and normalized MAC inside a token, or null if it is not a valid token. */
export function decodeDeviceToken(
  key: string,
  token: string,
): { deviceId: string; mac: string } | null {
  const inner = xor(Buffer.from(token, 'base64').toString('latin1'), key);
  const [deviceId, rawMac, ...rest] = Buffer.from(inner, 'base64').toString('latin1').split(',');
  if (rest.length > 0 || !deviceId || !DEVICE_ID.test(deviceId) || !rawMac) return null;
  const mac = MacAddress.parse(rawMac);
  return mac.ok ? { deviceId, mac: mac.value.value } : null;
}
