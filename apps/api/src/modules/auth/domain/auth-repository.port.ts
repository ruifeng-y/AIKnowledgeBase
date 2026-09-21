/** Auth domain port — no business logic in V0.4-D. */

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface AuthRepositoryPort {
  /** Placeholder port for future credential verification. */
  emailExists(email: string): Promise<boolean>;
}
