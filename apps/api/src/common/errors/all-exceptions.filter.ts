import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError, ERROR_CODES } from './app-errors';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

function resolveRequestId(request: Request): string {
  const incoming = request.headers['x-request-id'];
  if (typeof incoming === 'string' && incoming.trim().length > 0) {
    return incoming.trim();
  }
  return 'req_unknown';
}

function isSensitive(text: string): boolean {
  return /password|secret|token|api[_-]?key|authorization|jwt/i.test(text);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = resolveRequestId(request);

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL_ERROR;
    let message = 'Internal server error';

    if (exception instanceof AppError) {
      status = exception.httpStatus;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        const rawMessage = record['message'];
        message = Array.isArray(rawMessage)
          ? rawMessage.map(String).join('; ')
          : String(rawMessage ?? exception.message);
        const rawCode = record['code'];
        if (typeof rawCode === 'string') {
          code = rawCode;
        } else {
          code = status === 400 ? ERROR_CODES.VALIDATION_ERROR : code;
        }
      } else {
        message = exception.message;
      }
      if (status >= 500) {
        code = ERROR_CODES.INTERNAL_ERROR;
        message = 'Internal server error';
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    if (isSensitive(message)) {
      message = 'Request failed';
    }

    const payload: ErrorResponseBody = {
      error: {
        code,
        message,
        requestId,
      },
    };

    if (!response.headersSent) {
      response.status(status).json(payload);
    }
  }
}
