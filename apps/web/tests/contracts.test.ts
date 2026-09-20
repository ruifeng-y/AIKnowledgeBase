import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '@akb/contracts';
import { isHealthResponse } from '@akb/contracts';

describe('web skeleton contracts usage', () => {
  it('can import HealthResponse from @akb/contracts', () => {
    const sample: HealthResponse = { status: 'ok' };
    expect(sample.status).toBe('ok');
    expect(isHealthResponse(sample)).toBe(true);
  });
});
