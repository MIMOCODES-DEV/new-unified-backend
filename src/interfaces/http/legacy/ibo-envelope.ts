/**
 * IBO envelope rules (the "data=" format of the old TV apps):
 * - Alphabet: a–z, A–Z, then 1234567890. A character stands for its index (a = 0).
 * - Request: [position char][length char] + base64(JSON) with a random key of that length
 *   inserted at that position. Remove the key, base64-decode, parse JSON.
 * - Response: base64(JSON) with a key inserted at a random position (at most 50), then
 *   [position char][length char] APPENDED at the end. The app reads them from the end.
 * - The response reuses the request's key, like the old backends.
 * - Requests are decoded as Latin-1: the apps' btoa() only sends Latin-1, so accents arrive intact
 *   (the old backends used ASCII and turned "Télé" into "Tili"). Arabic can't be sent by these apps.
 * Test vectors: test/fixtures/legacy/codecs/envelope.json (from the real old code).
 */
import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
const MAX_RESPONSE_POSITION = 50;

export interface DecodedRequest {
  json: Record<string, unknown>;
  /** The app's random key; the response is encoded with it. */
  key: string;
}

/** Returns null when the text is not a valid envelope (missing, garbled, not a JSON object). */
export function decodeRequest(data: unknown): DecodedRequest | null {
  if (typeof data !== 'string' || data.length < 2) return null;
  const position = ALPHABET.indexOf(data.charAt(0));
  const length = ALPHABET.indexOf(data.charAt(1));
  if (position < 0 || length < 0) return null;

  const body = data.slice(2);
  const key = body.slice(position, position + length);
  const base64 = body.slice(0, position) + body.slice(position + length);
  try {
    const json: unknown = JSON.parse(Buffer.from(base64, 'base64').toString('latin1'));
    if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
    return { json: json as Record<string, unknown>, key };
  } catch {
    return null;
  }
}

/** Encodes a response the old apps can read. `key` = the request's key (or any random key). */
export function encodeResponse(value: unknown, key: string = randomKey()): string {
  const base64 = Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  const position = Math.min(randomInt(0, base64.length), base64.length - 1, MAX_RESPONSE_POSITION);
  const lengthChar = ALPHABET.charAt(key.length);
  return (
    base64.slice(0, position) +
    key +
    base64.slice(position) +
    ALPHABET.charAt(position) +
    lengthChar
  );
}

/** A random 20–29 character key, like the apps make. Used when the request had none. */
export function randomKey(): string {
  let key = '';
  for (let i = randomInt(20, 30); i > 0; i--) key += ALPHABET.charAt(randomInt(0, ALPHABET.length));
  return key;
}
