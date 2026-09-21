import { describe, expect, it } from 'vitest';
import { DB_PACKAGE } from '../src/index';

describe('@akb/db package', () => {
  it('exports package marker', () => {
    expect(DB_PACKAGE).toBe('@akb/db');
  });
});
