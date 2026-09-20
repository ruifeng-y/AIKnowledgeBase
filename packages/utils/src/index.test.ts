import { describe, expect, it } from 'vitest';
import { createRequestId, UTILS_PACKAGE } from '../src/index';

describe('@akb/utils skeleton', () => {
  it('exports package name', () => {
    expect(UTILS_PACKAGE).toBe('@akb/utils');
  });

  it('createRequestId returns prefixed id', () => {
    const id = createRequestId();
    expect(id.startsWith('req_')).toBe(true);
    expect(id.length).toBeGreaterThan(4);
  });
});
