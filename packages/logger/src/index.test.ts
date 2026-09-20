import { describe, expect, it } from 'vitest';
import { formatLogPayload, LOGGER_PACKAGE } from '../src/index';

describe('@akb/logger skeleton', () => {
  it('exports package name', () => {
    expect(LOGGER_PACKAGE).toBe('@akb/logger');
  });

  it('formats a simple payload', () => {
    expect(formatLogPayload({ level: 'info', message: 'boot' })).toBe(
      '{"level":"info","message":"boot"}',
    );
  });
});
