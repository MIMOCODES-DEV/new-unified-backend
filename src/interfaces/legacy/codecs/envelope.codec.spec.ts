import { describe, expect, it } from 'vitest';
import { ENVELOPE_ALPHABET, decodeEnvelope, encodeEnvelope } from './envelope.codec.js';
import { loadVectors } from './fixtures.spec-helper.js';

interface Vectors {
  requests: {
    client: string;
    input: Record<string, unknown>;
    encoded: string;
    decodedBy: Record<
      string,
      { json: unknown; enc_key: string; enc_position: number; enc_length_char: string }
    >;
  }[];
  responses: {
    server: string;
    client: string;
    payload: string;
    input: unknown;
    request: string;
    requestKey: string;
    encoded: string;
  }[];
}

const vectors = loadVectors<Vectors>('envelope.json');

describe('legacy envelope codec', () => {
  describe('decodes every request the real apps produce, like all three old backends', () => {
    for (const r of vectors.requests) {
      it(`${r.client}: ${JSON.stringify(r.input).slice(0, 50)}`, () => {
        const expected = r.decodedBy['iboplayer-backend'];
        if (!expected) throw new Error('fixture missing ibo decode');

        const result = decodeEnvelope(r.encoded);

        if (!result.ok) throw result.error;
        expect(result.value.json).toEqual(r.input);
        expect(result.value.key).toBe(expected.enc_key);
        expect(result.value.keyLengthChar).toBe(expected.enc_length_char);
      });
    }
  });

  describe('encodes responses byte-for-byte like the old makeEncryptResponse', () => {
    for (const r of vectors.responses) {
      it(`${r.server} → ${r.client}: ${r.payload}`, () => {
        const request = decodeEnvelope(r.request);
        if (!request.ok) throw request.error;
        // The old code picked the key position at random; the fixture's second-to-last char records it.
        const position = ENVELOPE_ALPHABET.indexOf(r.encoded.charAt(r.encoded.length - 2));

        const encoded = encodeEnvelope(r.input, request.value, () => position);

        expect(encoded).toBe(r.encoded);
      });
    }
  });

  it('round-trips Arabic text in a response (UTF-8)', () => {
    const request = decodeEnvelope(vectors.requests[0]?.encoded ?? '');
    if (!request.ok) throw request.error;
    const body = { name: 'قناة رياضية' };

    const encoded = encodeEnvelope(body, request.value);
    const keyAt = ENVELOPE_ALPHABET.indexOf(encoded.charAt(encoded.length - 2));
    const b64 = encoded.slice(0, -2);
    const withoutKey = b64.slice(0, keyAt) + b64.slice(keyAt + request.value.key.length);

    expect(JSON.parse(Buffer.from(withoutKey, 'base64').toString('utf8'))).toEqual(body);
  });

  it('keeps the key position within the old bounds: at most 50 and before the last character', () => {
    const request = decodeEnvelope(vectors.requests[0]?.encoded ?? '');
    if (!request.ok) throw request.error;

    const tiny = encodeEnvelope(1, request.value, () => 999);
    const long = encodeEnvelope({ text: 'x'.repeat(500) }, request.value, () => 999);

    expect(ENVELOPE_ALPHABET.indexOf(tiny.charAt(tiny.length - 2))).toBe(0); // "1" has length 1
    expect(ENVELOPE_ALPHABET.indexOf(long.charAt(long.length - 2))).toBe(50);
  });

  it('decodes Latin-1 text (what btoa produces) instead of stripping accents like the old ascii decode', () => {
    const json = JSON.stringify({ playlist_name: 'Télé Café' });
    const b64 = Buffer.from(json, 'latin1').toString('base64'); // like the apps' btoa
    const key = 'abcde';
    const data = 'df' + b64.slice(0, 3) + key + b64.slice(3); // position 3 ('d'), length 5 ('f')

    const result = decodeEnvelope(data);

    if (!result.ok) throw result.error;
    expect(result.value.json).toEqual({ playlist_name: 'Télé Café' });
  });

  it.each(['', 'A', 'zz', 'Ab!!!not-base64', 'Dfnot json at all'])(
    'rejects malformed input %j',
    (data) => {
      const result = decodeEnvelope(data);

      expect(!result.ok && result.error.code).toBe('legacy.bad_envelope');
    },
  );
});
