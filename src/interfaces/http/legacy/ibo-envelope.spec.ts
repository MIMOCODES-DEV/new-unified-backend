import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeRequest, encodeResponse } from './ibo-envelope.js';

interface Vectors {
  requests: { client: string; input: unknown; encoded: string }[];
  responses: { server: string; client: string; input: unknown; encoded: string }[];
}

const vectors = JSON.parse(
  readFileSync('test/fixtures/legacy/codecs/envelope.json', 'utf8'),
) as Vectors;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

/** What the apps do with a response (decryptResponse in their common.js): read the 2 chars at the end. */
function decodeLikeTheApp(text: string): unknown {
  const position = ALPHABET.indexOf(text.charAt(text.length - 2));
  const length = ALPHABET.indexOf(text.charAt(text.length - 1));
  const body = text.slice(0, -2);
  const base64 = body.slice(0, position) + body.slice(position + length);
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

describe('IBO envelope', () => {
  it('decodes every request the real apps encoded (CAP-03 vectors)', () => {
    for (const v of vectors.requests) {
      expect(decodeRequest(v.encoded)?.json, v.client).toEqual(v.input);
    }
  });

  it('reads responses encoded by the real old backends the same way the apps do', () => {
    for (const v of vectors.responses) {
      expect(decodeLikeTheApp(v.encoded), `${v.server} → ${v.client}`).toEqual(v.input);
    }
  });

  it('encodes responses the apps can read, including non-Latin text', () => {
    const value = { status: 'success', name: 'قناة Café', n: 7 };

    for (let i = 0; i < 50; i++) {
      expect(decodeLikeTheApp(encodeResponse(value, 'abcdefghijklmnopqrstu'))).toEqual(value);
    }
  });

  it('returns null for anything that is not an envelope', () => {
    for (const bad of [undefined, '', 'x', 42, '!!garbage', 'aa' + 'not base64 json']) {
      expect(decodeRequest(bad)).toBeNull();
    }
  });
});
