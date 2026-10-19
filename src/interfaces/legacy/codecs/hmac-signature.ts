import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Request signatures of the signed Android/TV routes:
 *   signature = base64(HMAC-SHA256(signingSecret, <the `data` ciphertext string>))
 * and the TV V3 identity:
 *   u_id = base64(HMAC-SHA1(TV signing secret, lower(mac) + TV AES secret))
 * Verified against test/fixtures/legacy/codecs/signatures.json. These secrets ship in the apps, so a
 * valid signature filters noise; it does not authenticate a user.
 */
export function signRequest(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64');
}

export function verifyRequestSignature(
  secret: string,
  data: string,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  return safeEqual(signRequest(secret, data), signature.trim()); // the old code trimmed
}

export function tvV3Uid(tvSigningSecret: string, tvAesSecret: string, mac: string): string {
  return createHmac('sha1', tvSigningSecret)
    .update(mac.toLowerCase() + tvAesSecret)
    .digest('base64');
}

export function verifyTvV3Uid(
  tvSigningSecret: string,
  tvAesSecret: string,
  mac: string,
  uid: string | undefined,
): boolean {
  if (!uid) return false;
  return safeEqual(tvV3Uid(tvSigningSecret, tvAesSecret, mac), uid.trim());
}

function safeEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}
