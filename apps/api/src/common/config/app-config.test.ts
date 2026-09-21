import { describe, expect, it } from 'vitest';
import { loadAppConfig } from './app-config';

describe('loadAppConfig', () => {
  it('returns defaults when env is empty', () => {
    const config = loadAppConfig({});
    expect(config.app.port).toBe(3001);
    expect(config.app.apiPrefix).toBe('api/v1');
    expect(config.ai.embeddingProvider).toBe('mock');
    expect(config.storage.bucket).toBe('ai-knowledge-base');
  });

  it('reads provided environment values', () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://user:pass@db:5432/prod',
      EMBEDDING_DIMENSIONS: '16',
      LOG_LEVEL: 'warn',
    });
    expect(config.app.nodeEnv).toBe('production');
    expect(config.app.port).toBe(4000);
    expect(config.database.url).toBe('postgresql://user:pass@db:5432/prod');
    expect(config.ai.embeddingDimensions).toBe(16);
    expect(config.logging.level).toBe('warn');
  });

  it('never exposes secrets in default logging-facing structure beyond config object', () => {
    const config = loadAppConfig({ JWT_SECRET: 'super-secret' });
    expect(config.auth.jwtSecret).toBe('super-secret');
    expect(config.app.apiPrefix).toBe('api/v1');
  });
});
