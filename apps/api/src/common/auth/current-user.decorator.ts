import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { authInvalidToken } from '../errors/app-errors';
import type { AuthenticatedUser } from '../../modules/auth/domain/auth-ports';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user) {
      throw authInvalidToken();
    }
    return request.user;
  },
);
