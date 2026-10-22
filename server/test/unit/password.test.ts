import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('SCRUM-34: password hashing (scrypt)', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('never stores the plain password in the hash', async () => {
    expect(await hashPassword('plaintext-secret')).not.toContain('plaintext-secret');
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$aa$bb')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$aa')).toBe(false);
  });
});
