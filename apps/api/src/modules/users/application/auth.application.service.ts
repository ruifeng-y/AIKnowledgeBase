import type {
  AuthTokens,
  AuthUserPublic,
  PasswordServicePort,
  TokenServicePort,
} from '../../auth/domain/auth-ports';
import type { UserAccountRepositoryPort } from '../domain/user-account.port';
import {
  authAccountInactive,
  authEmailExists,
  authInvalidCredentials,
  ValidationError,
} from '../../../common/errors/app-errors';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}): AuthUserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

export class AuthApplicationService {
  constructor(
    private readonly users: UserAccountRepositoryPort,
    private readonly password: PasswordServicePort,
    private readonly tokens: TokenServicePort,
  ) {}

  private issue(userId: string): AuthTokens {
    return {
      accessToken: this.tokens.signAccessToken({ sub: userId }),
      refreshToken: this.tokens.signRefreshToken({ sub: userId }),
      tokenType: 'Bearer',
      expiresIn: '15m',
    };
  }

  async register(input: RegisterInput): Promise<{ user: AuthUserPublic; tokens: AuthTokens }> {
    const email = normalizeEmail(input.email);
    const password = input.password;
    const name = input.name.trim();

    if (!email || !email.includes('@') || email.length > 320) {
      throw new ValidationError('Invalid email');
    }
    if (password.length < 8 || password.length > 128) {
      throw new ValidationError('Password must be 8-128 characters');
    }
    if (name.length < 1 || name.length > 100) {
      throw new ValidationError('Name must be 1-100 characters');
    }

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw authEmailExists();
    }

    const passwordHash = await this.password.hash(password);
    const user = await this.users.create({ email, passwordHash, name });
    return { user: toPublicUser(user), tokens: this.issue(user.id) };
  }

  async login(input: LoginInput): Promise<{ user: AuthUserPublic; tokens: AuthTokens }> {
    const email = normalizeEmail(input.email);
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw authInvalidCredentials();
    }

    const ok = await this.password.verify(user.passwordHash, input.password);
    if (!ok) {
      throw authInvalidCredentials();
    }
    if (user.status !== 'ACTIVE') {
      throw authAccountInactive();
    }

    const profile = await this.users.findById(user.id);
    if (!profile) {
      throw authInvalidCredentials();
    }

    return { user: toPublicUser(profile), tokens: this.issue(user.id) };
  }

  refresh(refreshToken: string): { tokens: AuthTokens } {
    const payload = this.tokens.verifyToken(refreshToken, 'refresh');
    return { tokens: this.issue(payload.sub) };
  }

  logout(): { success: true } {
    // Stateless JWT refresh tokens: client discards tokens. No server-side session in V0.4-E.
    return { success: true };
  }

  async me(userId: string): Promise<AuthUserPublic> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw authInvalidCredentials();
    }
    return toPublicUser(user);
  }
}
