import { describe, expect, it } from 'vitest';
import { Argon2PasswordService } from './argon2-password.service';

describe('Argon2PasswordService', () => {
  const service = new Argon2PasswordService();

  it('hashes and verifies password', async () => {
    const hash = await service.hash('password123');
    expect(hash).not.toContain('password123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(hash, 'password123')).resolves.toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await service.hash('password123');
    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
  });
});
