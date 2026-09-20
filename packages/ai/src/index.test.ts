import { describe, expect, it } from 'vitest';
import { AI_PACKAGE } from '../src/index';

describe('@akb/ai skeleton', () => {
  it('exports package name', () => {
    expect(AI_PACKAGE).toBe('@akb/ai');
  });
});
