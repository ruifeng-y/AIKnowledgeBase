import { describe, expect, it } from 'vitest';
import { DB_PACKAGE } from '../src/index';

describe('@akb/db skeleton', () => {
  it('exports package name', () => {
    expect(DB_PACKAGE).toBe('@akb/db');
  });
});
