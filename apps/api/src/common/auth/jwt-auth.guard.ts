import type { ExecutionContext } from '@nestjs/common';
import { CanActivate, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { authInvalidToken } from '../errors/app-errors';
import type { AuthenticatedUser, TokenServicePort } from '../../modules/auth/domain/auth-ports';
import { TOKEN_SERVICE } from '../../modules/auth/domain/auth-ports';
import type { UserAccountRepositoryPort } from '../../modules/users/domain/user-account.port';
import { USER_ACCOUNT_REPOSITORY } from '../../modules/users/domain/user-account.port';

export const IS_PUBLIC_KEY = 'akb:isPublic';
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);

export function extractBearer(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenServicePort,
    private readonly users: UserAccountRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearer(request.headers.authorization);
    if (!token) {
      throw authInvalidToken();
    }
    const payload = this.tokens.verifyToken(token, 'access');
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw authInvalidToken();
    }
    request.user = { id: user.id, email: user.email };
    return true;
  }
}

export const AUTH_TOKEN_SERVICE = TOKEN_SERVICE;
export const AUTH_USER_REPOSITORY = USER_ACCOUNT_REPOSITORY;
