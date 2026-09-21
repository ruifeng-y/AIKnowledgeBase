import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { NotFoundError, ValidationError } from './app-errors';

interface FakeResponse {
  headersSent: boolean;
  statusCode: number;
  body: unknown;
  status(code: number): { json(payload: unknown): void };
}

function createHost(headers: Record<string, string> = {}): {
  host: ArgumentsHost;
  response: FakeResponse;
} {
  const response: FakeResponse = {
    headersSent: false,
    statusCode: 0,
    body: undefined,
    status(code: number) {
      response.statusCode = code;
      return {
        json(payload: unknown) {
          response.body = payload;
        },
      };
    },
  };
  const request = { headers };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps AppError to unified payload with requestId', () => {
    const { host, response } = createHost({ 'x-request-id': 'req_abc' });
    filter.catch(new NotFoundError('Resource missing'), host);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource missing',
        requestId: 'req_abc',
      },
    });
  });

  it('hides internal errors and never returns stack or secrets', () => {
    const { host, response } = createHost();
    filter.catch(new Error('db password leaked at line 42'), host);

    const body = response.body as { error: { code: string; message: string; requestId: string } };
    expect(response.statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toMatch(/password|stack|line 42/i);
  });

  it('maps HttpException validation messages', () => {
    const { host, response } = createHost({ 'x-request-id': 'req_val' });
    filter.catch(
      new HttpException(
        { message: ['email must be an email'], code: 'VALIDATION_ERROR' },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    const body = response.body as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('email must be an email');
    expect(body.error.requestId).toBe('req_val');
  });

  it('supports domain ValidationError', () => {
    const { host, response } = createHost({ 'x-request-id': 'req_v' });
    filter.catch(new ValidationError('Invalid payload'), host);
    expect(response.statusCode).toBe(400);
  });
});
