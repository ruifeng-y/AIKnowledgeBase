import * as argon2 from 'argon2';
import type { PasswordServicePort } from '../../modules/auth/domain/auth-ports';

export class Argon2PasswordService implements PasswordServicePort {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password).catch(() => false);
  }
}
