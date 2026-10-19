import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { BadTokenError } from './codec.errors.js';

/**
 * The device token of Roku, iOS/Android v2–v3 and V4 apps:
 *   token = base64(utf8(xor(base64("<deviceId>,<mac>"), key)))
 * Identical in iboplayer, bobplayer and cr-unified (test/fixtures/legacy/codecs/xor-token.json).
 * The key is public (it ships in the apps), so a token proves nothing on its own: callers must still
 * check that the device exists and that its MAC matches.
 */
export function encodeXorToken(key: string, deviceId: string, mac: string): string {
  const inner = Buffer.from(`${deviceId},${mac}`, 'utf8').toString('base64');
  return Buffer.from(xor(inner, key), 'utf8').toString('base64');
}

export interface DecodedXorToken {
  deviceId: string;
  mac: string;
}

// Device ids: old Mongo ObjectIds, new UUIDs, or short test ids. MACs in any common spelling.
const DEVICE_ID = /^[A-Za-z0-9-]{1,64}$/;
const MAC_LIKE = /^[0-9A-Fa-f:.-]{12,17}$/;

export function decodeXorToken(key: string, token: string): Result<DecodedXorToken, BadTokenError> {
  if (!token || key.length === 0) return err(new BadTokenError('Missing device token'));
  // The old decoder read the outer base64 as 'ascii'; the encoder wrote UTF-8. XOR of base64 chars
  // with an ASCII key stays ASCII, so both agree for every genuine token.
  const inner = xor(Buffer.from(token, 'base64').toString('utf8'), key);
  const parts = Buffer.from(inner, 'base64').toString('utf8').split(',');
  const [deviceId, mac] = parts;
  if (parts.length !== 2 || !deviceId || !mac || !DEVICE_ID.test(deviceId) || !MAC_LIKE.test(mac)) {
    // The old decoder returned garbage such as { device_id: "})" } here; we refuse instead.
    return err(new BadTokenError('Invalid device token'));
  }
  return ok({ deviceId, mac });
}

function xor(text: string, key: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}
