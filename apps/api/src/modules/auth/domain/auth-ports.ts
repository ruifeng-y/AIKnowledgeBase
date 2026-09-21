export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}

export interface AuthUserPublic {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export const PASSWORD_SERVICE = Symbol('PASSWORD_SERVICE');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

export interface PasswordServicePort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  sub: string;
  type: TokenType;
}

export interface TokenServicePort {
  signAccessToken(payload: { sub: string }): string;
  signRefreshToken(payload: { sub: string }): string;
  verifyToken(token: string, expectedType: TokenType): TokenPayload;
}
