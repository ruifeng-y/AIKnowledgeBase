import { describe, expect, it } from 'vitest';
import { CONFIG_PACKAGE, readBaseRuntimeConfig } from '../src/index';

describe('@akb/config skeleton', () => {
  it('exports package name', () => {
    expect(CONFIG_PACKAGE).toBe('@akb/config');
  });

  it('reads defaults when env is empty', () => {
    const config = readBaseRuntimeConfig({});
    expect(config).toEqual({
      nodeEnv: 'development',
      apiPort: 3001,
      webPort: 3000,
    });
  });

  it('parses provided ports', () => {
    const config = readBaseRuntimeConfig({
      NODE_ENV: 'production',
      API_PORT: '4000',
      WEB_PORT: '4001',
    });
    expect(config.nodeEnv).toBe('production');
    expect(config.apiPort).toBe(4000);
    expect(config.webPort).toBe(4001);
  });
});
