import { describe, expect, it } from 'vitest';
import { resolveEmbeddingProvider } from '@akb/ai';
import { EmbeddingService } from './embedding.service';

function providerOf(service: EmbeddingService): { identity(): { provider: string } } {
  return (service as unknown as { provider: { identity(): { provider: string } } }).provider;
}

describe('worker embedding provider resolution', () => {
  it('test config + mock → Mock embedding', () => {
    const service = EmbeddingService.createFromEnv({
      EMBEDDING_PROVIDER: 'mock',
      EMBEDDING_MODEL: 'mock-embedding-v1',
      EMBEDDING_DIMENSION: '8',
      NODE_ENV: 'test',
    });
    expect(providerOf(service).identity().provider).toBe('mock');
  });

  it('production config → Production Embedding Adapter via registry', () => {
    const service = EmbeddingService.createFromEnv({
      EMBEDDING_PROVIDER: 'openai-compatible',
      EMBEDDING_MODEL: 'emb-test',
      EMBEDDING_ENDPOINT: 'https://api.example.com/v1',
      EMBEDDING_API_KEY: 'k',
      EMBEDDING_DIMENSION: '8',
      NODE_ENV: 'production',
    });
    expect(providerOf(service).identity().provider).toBe('openai-compatible');
  });

  it('production + mock without EVALUATION_MODE is rejected', () => {
    expect(() =>
      EmbeddingService.createFromEnv({
        EMBEDDING_PROVIDER: 'mock',
        NODE_ENV: 'production',
      }),
    ).toThrow(/mock embedding/);
  });

  it('production + mock with EVALUATION_MODE=mock is allowed', () => {
    const service = EmbeddingService.createFromEnv({
      EMBEDDING_PROVIDER: 'mock',
      NODE_ENV: 'production',
      EVALUATION_MODE: 'mock',
      EMBEDDING_DIMENSION: '8',
    });
    expect(providerOf(service).identity().provider).toBe('mock');
  });

  it('resolveEmbeddingProvider respects explicit mock vs real', () => {
    const mock = resolveEmbeddingProvider({
      providerId: 'mock',
      modelId: 'm',
      endpoint: '',
      apiKey: undefined,
      timeoutMs: 1000,
      maxRetries: 1,
      enabled: true,
      dimensions: 8,
      batchSize: 2,
    });
    expect(mock.identity().provider).toBe('mock');
    const real = resolveEmbeddingProvider({
      providerId: 'openai-compatible',
      modelId: 'm',
      endpoint: 'https://x.test',
      apiKey: 'k',
      timeoutMs: 1000,
      maxRetries: 0,
      enabled: true,
      dimensions: 8,
      batchSize: 2,
    });
    expect(real.identity().provider).toBe('openai-compatible');
  });
});
