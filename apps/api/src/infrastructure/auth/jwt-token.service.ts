import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import { authInvalidToken, authTokenExpired } from '../../common/errors/app-errors';
import type {
  TokenPayload,
  TokenServicePort,
  TokenType,
} from '../../modules/auth/domain/auth-ports';

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  signAccessToken(payload: { sub: string }): string {
    return this.jwt.sign(
      { sub: payload.sub, type: 'access' },
      { expiresIn: this.config.auth.accessTokenTtl as never },
    );
  }

  signRefreshToken(payload: { sub: string }): string {
    return this.jwt.sign(
      { sub: payload.sub, type: 'refresh' },
      { expiresIn: this.config.auth.refreshTokenTtl as never },
    );
  }

  verifyToken(token: string, expectedType: TokenType): TokenPayload {
    try {
      const decoded = this.jwt.verify<{ sub?: string; type?: string }>(token, {
        secret: this.config.auth.jwtSecret,
      });
      if (!decoded.sub || decoded.type !== expectedType) {
        throw authInvalidToken();
      }
      return { sub: decoded.sub, type: expectedType };
    } catch (error) {
      const err = error as { name?: string; code?: number; httpStatus?: number };
      if (typeof err.httpStatus === 'number') {
        throw error as Error;
      }
      if (err.name === 'TokenExpiredError' || err.name === 'TokenExpiredError') {
        throw authTokenExpired();
      }
      if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
        throw authInvalidToken();
      }
      throw authInvalidToken();
    }
  }
}
