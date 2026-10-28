import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { BcryptPasswordHasher } from './bcrypt-password-hasher.js';

describe('BcryptPasswordHasher (ACC-2)', () => {
  const hasher = new BcryptPasswordHasher();

  it('hashes a password and verifies it; a wrong one fails', async () => {
    const hash = await hasher.hash('correct horse 1');

    expect(hash).not.toContain('correct horse');
    expect(await hasher.verify('correct horse 1', hash)).toBe(true);
    expect(await hasher.verify('correct horse 2', hash)).toBe(false);
  });

  it('verifies old hashes unchanged: cost 10, in the $2b$ form of node bcrypt and the older $2a$', async () => {
    // The old cr site: `bcrypt.hash(password, 10)` with the `bcrypt` package, which writes $2b$.
    const old = await bcrypt.hash('Secret123', 10);
    const as2b = `$2b$${old.slice(4)}`;
    const as2a = `$2a$${old.slice(4)}`;

    expect(await hasher.verify('Secret123', as2b)).toBe(true);
    expect(await hasher.verify('Secret123', as2a)).toBe(true);
    expect(await hasher.verify('secret123', as2b)).toBe(false);
  });

  it('answers false, never throws, for a hash it cannot read', async () => {
    expect(await hasher.verify('x', 'not-a-hash')).toBe(false);
    expect(await hasher.verify('x', '')).toBe(false);
  });
});
