import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '../src/index';
import { isHealthResponse } from '../src/index';

describe('HealthResponse contract', () => {
  it('defines a valid ok payload', () => {
    const payload: HealthResponse = { status: 'ok' };
    expect(payload.status).toBe('ok');
  });

  it('isHealthResponse accepts valid object', () => {
    expect(isHealthResponse({ status: 'ok' })).toBe(true);
  });

  it('isHealthResponse rejects invalid values', () => {
    expect(isHealthResponse(null)).toBe(false);
    expect(isHealthResponse(undefined)).toBe(false);
    expect(isHealthResponse({ status: 'error' })).toBe(false);
    expect(isHealthResponse({})).toBe(false);
  });
});
