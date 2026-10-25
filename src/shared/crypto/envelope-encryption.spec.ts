import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EnvelopeEncryption } from './envelope-encryption.js';

const vault = new EnvelopeEncryption(randomBytes(32));

describe('EnvelopeEncryption', () => {
  it('opens what it sealed', () => {
    const sealed = vault.seal('sk_live_123', 'tenant-a/paypal.secret');

    expect(vault.open(sealed, 'tenant-a/paypal.secret')).toBe('sk_live_123');
  });

  it('never stores the value in clear and uses a fresh data key each time', () => {
    const one = vault.seal('sk_live_123', 'ctx');
    const two = vault.seal('sk_live_123', 'ctx');

    expect(JSON.stringify(one)).not.toContain('sk_live_123');
    expect(one.data).not.toBe(two.data);
    expect(one.dataKey).not.toBe(two.dataKey);
  });

  it('refuses a ciphertext moved to another brand or name', () => {
    const sealed = vault.seal('sk_live_123', 'tenant-a/paypal.secret');

    expect(() => vault.open(sealed, 'tenant-b/paypal.secret')).toThrow();
    expect(() => vault.open(sealed, 'tenant-a/stripe.secret')).toThrow();
  });

  it('refuses a tampered ciphertext', () => {
    const sealed = vault.seal('sk_live_123', 'ctx');
    const bytes = Buffer.from(sealed.data, 'base64');
    bytes[bytes.length - 1]! ^= 1;

    expect(() => vault.open({ ...sealed, data: bytes.toString('base64') }, 'ctx')).toThrow();
  });

  it('says clearly when the master key is not the one that sealed', () => {
    const sealed = vault.seal('sk_live_123', 'ctx');

    expect(() => new EnvelopeEncryption(randomBytes(32)).open(sealed, 'ctx')).toThrow(
      'another master key',
    );
  });

  it('requires a 32-byte master key', () => {
    expect(() => EnvelopeEncryption.fromBase64('c2hvcnQ=')).toThrow('32 bytes');
  });
});
