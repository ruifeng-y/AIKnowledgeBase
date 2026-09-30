import { describe, expect, it } from 'vitest';
import {
  assertCapabilityMockAllowed,
  assertProductionMockAllowed,
  buildProviderRuntimeSnapshot,
  computeConfigFingerprint,
  loadEmbeddingProviderConfig,
  loadLlmProviderConfig,
  loadRerankerProviderConfig,
  ProviderConfigError,
  validateProviderConfig,
} from './provider-config';

describe('provider config single source of truth', () => {
  it('valid config passes', () => {
    expect(() =>
      validateProviderConfig({
        providerId: 'mock',
        modelId: 'm',
        endpoint: '',
        apiKey: undefined,
        timeoutMs: 1000,
        maxRetries: 3,
        enabled: true,
        dimensions: 8,
      }),
    ).not.toThrow();
  });

  it('production missing credential / endpoint rejected', () => {
    expect(() =>
      validateProviderConfig({
        providerId: 'openai-compatible',
        modelId: 'm',
        endpoint: '',
        apiKey: undefined,
        timeoutMs: 1000,
        maxRetries: 0,
        enabled: true,
      }),
    ).toThrow(ProviderConfigError);
    expect(() =>
      validateProviderConfig({
        providerId: 'openai-compatible',
        modelId: 'm',
        endpoint: 'not-a-url',
        apiKey: 'k',
        timeoutMs: 1000,
        maxRetries: 0,
        enabled: true,
      }),
    ).toThrow(/URL/);
    expect(() =>
      validateProviderConfig({
        providerId: 'openai-compatible',
        modelId: 'm',
        endpoint: 'https://api.example.com',
        apiKey: undefined,
        timeoutMs: 1000,
        maxRetries: 0,
        enabled: true,
      }),
    ).toThrow(/apiKey/);
  });

  it('invalid numeric fields rejected', () => {
    const base = {
      providerId: 'mock',
      modelId: 'm',
      endpoint: '',
      apiKey: undefined,
      timeoutMs: 1000,
      maxRetries: 1,
      enabled: true,
    };
    expect(() => validateProviderConfig({ ...base, timeoutMs: 0 })).toThrow();
    expect(() => validateProviderConfig({ ...base, maxRetries: -1 })).toThrow();
    expect(() => validateProviderConfig({ ...base, dimensions: 0 })).toThrow();
    expect(() => validateProviderConfig({ ...base, batchSize: 0 })).toThrow(/batchSize/);
    expect(() => validateProviderConfig({ ...base, maxCandidates: 0 })).toThrow(/maxCandidates/);
    expect(() => validateProviderConfig({ ...base, maxOutputTokens: 0 })).toThrow(
      /maxOutputTokens/,
    );
    expect(() => validateProviderConfig({ ...base, providerId: '' })).toThrow(/providerId/);
  });

  it('fingerprint changes when endpoint, timeout, or dimensions change', () => {
    const r = loadRerankerProviderConfig({});
    const l = loadLlmProviderConfig({});
    const e1 = loadEmbeddingProviderConfig({
      EMBEDDING_ENDPOINT: 'https://a.test/v1',
      EMBEDDING_TIMEOUT_MS: '1000',
      EMBEDDING_DIMENSIONS: '8',
      EMBEDDING_MODEL: 'm',
    });
    const e2 = loadEmbeddingProviderConfig({
      EMBEDDING_ENDPOINT: 'https://b.test/v1',
      EMBEDDING_TIMEOUT_MS: '1000',
      EMBEDDING_DIMENSIONS: '8',
      EMBEDDING_MODEL: 'm',
    });
    const e3 = loadEmbeddingProviderConfig({
      EMBEDDING_ENDPOINT: 'https://a.test/v1',
      EMBEDDING_TIMEOUT_MS: '2000',
      EMBEDDING_DIMENSIONS: '8',
      EMBEDDING_MODEL: 'm',
    });
    const e4 = loadEmbeddingProviderConfig({
      EMBEDDING_ENDPOINT: 'https://a.test/v1',
      EMBEDDING_TIMEOUT_MS: '1000',
      EMBEDDING_DIMENSIONS: '16',
      EMBEDDING_MODEL: 'm',
    });
    const base = computeConfigFingerprint(e1, r, l);
    expect(computeConfigFingerprint(e2, r, l)).not.toBe(base);
    expect(computeConfigFingerprint(e3, r, l)).not.toBe(base);
    expect(computeConfigFingerprint(e4, r, l)).not.toBe(base);
  });

  it('production mock is rejected for every capability without EVALUATION_MODE', () => {
    expect(() =>
      assertProductionMockAllowed({
        NODE_ENV: 'production',
        EMBEDDING_PROVIDER: 'mock',
      }),
    ).toThrow(/mock embedding provider/);
    expect(() =>
      assertProductionMockAllowed({
        NODE_ENV: 'production',
        EMBEDDING_PROVIDER: 'openai-compatible',
        EMBEDDING_ENDPOINT: 'https://x.test',
        EMBEDDING_API_KEY: 'k',
        RERANKER_PROVIDER: 'mock',
      }),
    ).toThrow(/mock reranker provider/);
    expect(() =>
      assertProductionMockAllowed({
        NODE_ENV: 'production',
        EMBEDDING_PROVIDER: 'openai-compatible',
        EMBEDDING_ENDPOINT: 'https://x.test',
        EMBEDDING_API_KEY: 'k',
        RERANKER_PROVIDER: 'http',
        RERANKER_ENDPOINT: 'https://x.test',
        RERANKER_API_KEY: 'k',
        LLM_PROVIDER: 'mock',
      }),
    ).toThrow(/mock llm provider/);
    expect(() =>
      assertProductionMockAllowed({
        NODE_ENV: 'production',
        EVALUATION_MODE: 'mock',
        EMBEDDING_PROVIDER: 'mock',
        RERANKER_PROVIDER: 'mock',
        LLM_PROVIDER: 'mock',
      }),
    ).not.toThrow();
  });

  it('assertCapabilityMockAllowed guards a single capability', () => {
    expect(() =>
      assertCapabilityMockAllowed('embedding', 'mock', {
        NODE_ENV: 'production',
      }),
    ).toThrow(/mock embedding provider/);
    expect(() =>
      assertCapabilityMockAllowed('embedding', 'mock', {
        NODE_ENV: 'test',
      }),
    ).not.toThrow();
  });

  it('loads defaults and explicit env names', () => {
    const cfg = loadEmbeddingProviderConfig({
      EMBEDDING_PROVIDER_ID: 'openai-compatible',
      EMBEDDING_MODEL_ID: 'emb-1',
      EMBEDDING_ENDPOINT: 'https://x.test/v1',
      EMBEDDING_API_KEY: 'k',
      EMBEDDING_DIMENSIONS: '1536',
    });
    expect(cfg.providerId).toBe('openai-compatible');
    expect(cfg.modelId).toBe('emb-1');
    expect(cfg.dimensions).toBe(1536);
    expect(cfg.timeoutMs).toBe(30000);
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.batchSize).toBe(32);
  });

  it('independent provider selection', () => {
    const env = {
      EMBEDDING_PROVIDER: 'mock',
      RERANKER_PROVIDER: 'http',
      LLM_PROVIDER: 'openai-compatible',
    };
    expect(loadEmbeddingProviderConfig(env).providerId).toBe('mock');
    expect(loadRerankerProviderConfig(env).providerId).toBe('http');
    expect(loadLlmProviderConfig(env).providerId).toBe('openai-compatible');
  });

  it('config fingerprint stable and secret-free', () => {
    const e1 = loadEmbeddingProviderConfig({
      EMBEDDING_API_KEY: 'SECRET_A',
      EMBEDDING_MODEL: 'm1',
    });
    const e2 = loadEmbeddingProviderConfig({
      EMBEDDING_API_KEY: 'SECRET_B',
      EMBEDDING_MODEL: 'm1',
    });
    const r = loadRerankerProviderConfig({});
    const l = loadLlmProviderConfig({});
    expect(computeConfigFingerprint(e1, r, l)).toBe(computeConfigFingerprint(e2, r, l));
    const e3 = loadEmbeddingProviderConfig({ EMBEDDING_MODEL: 'm2' });
    expect(computeConfigFingerprint(e3, r, l)).not.toBe(computeConfigFingerprint(e1, r, l));
    const snapshot = buildProviderRuntimeSnapshot({ EMBEDDING_API_KEY: 'SECRET_A' });
    expect(JSON.stringify(snapshot)).not.toContain('SECRET_A');
    expect(snapshot.configFingerprint).toMatch(/^cfg_/);
    expect(snapshot.embedding.provider).toBeTruthy();
  });
});
