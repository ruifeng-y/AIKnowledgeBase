export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
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
