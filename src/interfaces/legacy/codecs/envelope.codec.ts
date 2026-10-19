import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { BadEnvelopeError } from './codec.errors.js';

/**
 * The obfuscated "envelope" of the old TV apps. Not encryption: base64 JSON with a random key spliced in.
 *
 * Request `{data}`:  A[p] + A[n] + b64[0:p] + key(n chars) + b64[p:]
 * Response:          b64[0:q] + requestKey + b64[q:] + A[q] + A[n]   (locators appended at the end)
 *
 * Wire-compatible with decryptRequest / makeEncryptResponse of iboplayer, bobplayer and cr-unified
 * (verified against test/fixtures/legacy/codecs/envelope.json).
 */
export const ENVELOPE_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_RESPONSE_KEY_POSITION = 50;

export interface DecodedEnvelope {
  json: unknown;
  /** The key the app spliced in; the response must splice the same key back. */
  key: string;
  /** The app's key-length locator char; the response ends with it. */
  keyLengthChar: string;
}

export function decodeEnvelope(data: string): Result<DecodedEnvelope, BadEnvelopeError> {
  const position = ENVELOPE_ALPHABET.indexOf(data.charAt(0));
  const length = ENVELOPE_ALPHABET.indexOf(data.charAt(1));
  const body = data.slice(2);
  if (data.length < 2 || position < 0 || length < 0 || position + length > body.length) {
    return err(new BadEnvelopeError('Invalid envelope locators'));
  }
  const key = body.slice(position, position + length);
  const base64 = body.slice(0, position) + body.slice(position + length);
  if (base64.length === 0 || !BASE64.test(base64)) {
    return err(new BadEnvelopeError('Envelope body is not base64'));
  }
  try {
    // The apps build the body with btoa(), i.e. Latin-1 bytes. The old backends decoded with 'ascii',
    // which strips the high bit ("Télé" → "Tili"); Latin-1 gives the exact text back.
    const json: unknown = JSON.parse(Buffer.from(base64, 'base64').toString('latin1'));
    return ok({ json, key, keyLengthChar: data.charAt(1) });
  } catch {
    return err(new BadEnvelopeError('Envelope body is not JSON'));
  }
}

/**
 * Encodes a response for the app that sent `request`. `pickPosition` chooses the key position
 * (random by default); it is clamped to the old bounds: at most 50 and before the last character.
 */
export function encodeEnvelope(
  body: unknown,
  request: Pick<DecodedEnvelope, 'key' | 'keyLengthChar'>,
  pickPosition: (jsonLength: number) => number = (n) => Math.floor(Math.random() * n),
): string {
  const json = JSON.stringify(body);
  const position = Math.max(
    0,
    Math.min(pickPosition(json.length), json.length - 1, MAX_RESPONSE_KEY_POSITION),
  );
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  return (
    base64.slice(0, position) +
    request.key +
    base64.slice(position) +
    ENVELOPE_ALPHABET.charAt(position) +
    request.keyLengthChar
  );
}
