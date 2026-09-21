export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  AUTH_EMAIL_ALREADY_EXISTS: 'AUTH_EMAIL_ALREADY_EXISTS',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_INACTIVE: 'AUTH_ACCOUNT_INACTIVE',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_SLUG_ALREADY_EXISTS: 'WORKSPACE_SLUG_ALREADY_EXISTS',
  WORKSPACE_FORBIDDEN: 'WORKSPACE_FORBIDDEN',
  KNOWLEDGE_SPACE_NOT_FOUND: 'KNOWLEDGE_SPACE_NOT_FOUND',
  KNOWLEDGE_SPACE_SLUG_ALREADY_EXISTS: 'KNOWLEDGE_SPACE_SLUG_ALREADY_EXISTS',
  KNOWLEDGE_SPACE_FORBIDDEN: 'KNOWLEDGE_SPACE_FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code = ERROR_CODES.VALIDATION_ERROR;
  readonly httpStatus = 400;
}

export class UnauthorizedError extends AppError {
  readonly code = ERROR_CODES.UNAUTHORIZED;
  readonly httpStatus = 401;
}

export class ForbiddenError extends AppError {
  readonly code = ERROR_CODES.FORBIDDEN;
  readonly httpStatus = 403;
}

export class NotFoundError extends AppError {
  readonly code = ERROR_CODES.NOT_FOUND;
  readonly httpStatus = 404;
}

export class ConflictError extends AppError {
  readonly code = ERROR_CODES.CONFLICT;
  readonly httpStatus = 409;
}

export class InternalError extends AppError {
  readonly code = ERROR_CODES.INTERNAL_ERROR;
  readonly httpStatus = 500;
}

export class CodedAppError extends AppError {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

export function authEmailExists(): CodedAppError {
  return new CodedAppError(ERROR_CODES.AUTH_EMAIL_ALREADY_EXISTS, 409, 'Email already exists');
}

export function authInvalidCredentials(): CodedAppError {
  return new CodedAppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 401, 'Invalid email or password');
}

export function authAccountInactive(): CodedAppError {
  return new CodedAppError(ERROR_CODES.AUTH_ACCOUNT_INACTIVE, 401, 'Account is inactive');
}

export function authInvalidToken(): CodedAppError {
  return new CodedAppError(ERROR_CODES.AUTH_INVALID_TOKEN, 401, 'Invalid token');
}

export function authTokenExpired(): CodedAppError {
  return new CodedAppError(ERROR_CODES.AUTH_TOKEN_EXPIRED, 401, 'Token expired');
}

export function workspaceNotFound(): CodedAppError {
  return new CodedAppError(ERROR_CODES.WORKSPACE_NOT_FOUND, 404, 'Workspace not found');
}

export function workspaceSlugExists(): CodedAppError {
  return new CodedAppError(
    ERROR_CODES.WORKSPACE_SLUG_ALREADY_EXISTS,
    409,
    'Workspace slug already exists',
  );
}

export function knowledgeSpaceNotFound(): CodedAppError {
  return new CodedAppError(ERROR_CODES.KNOWLEDGE_SPACE_NOT_FOUND, 404, 'Knowledge space not found');
}

export function knowledgeSpaceSlugExists(): CodedAppError {
  return new CodedAppError(
    ERROR_CODES.KNOWLEDGE_SPACE_SLUG_ALREADY_EXISTS,
    409,
    'Knowledge space slug already exists',
  );
}
