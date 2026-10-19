/**
 * Signature rules of the signed v2/v3 routes (test vectors: test/fixtures/legacy/codecs/signatures.json):
 * - Request signature = base64( HMAC-SHA256(signing secret, data) ), data = the AES text as sent.
 * - TV v3 u_id = base64( HMAC-SHA1(signing secret, lowercase(mac) + AES secret) ).
 * Both secrets ship inside the apps, so these prove "sent by an app build", not who the user is.
 * Comparisons are constant-time.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function sign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64');
}

export function tvV3Uid(signingSecret: string, aesSecret: string, mac: string): string {
  return createHmac('sha1', signingSecret)
    .update(mac.toLowerCase() + aesSecret)
    .digest('base64');
}

/** Equal strings, without leaking where they differ through timing. */
export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a.trim());
  const y = Buffer.from(b.trim());
  return x.length === y.length && timingSafeEqual(x, y);
}
