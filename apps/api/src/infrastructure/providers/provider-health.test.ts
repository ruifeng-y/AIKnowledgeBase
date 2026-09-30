import { describe, expect, it } from 'vitest';
import {
  checkAll,
  checkEmbedding,
  checkLlm,
  checkReranker,
  runProviderSmokeTest,
} from './provider-health';

const mockEmbedding = {
  providerId: 'mock',
  modelId: 'mock-embedding-v1',
  endpoint: '',
  apiKey: undefined,
  timeoutMs: 1000,
  maxRetries: 0,
  enabled: true,
  dimensions: 8,
  batchSize: 2,
};

const mockReranker = {
  providerId: 'mock',
  modelId: 'mock-reranker-v1',
  endpoint: '',
  apiKey: undefined,
  timeoutMs: 1000,
  maxRetries: 0,
  enabled: true,
  maxCandidates: 10,
  batchSize: 4,
};

const mockLlm = {
  providerId: 'mock',
  modelId: 'mock-llm-v1',
  endpoint: '',
  apiKey: undefined,
  timeoutMs: 1000,
  maxRetries: 0,
  enabled: true,
  maxInputTokens: 1024,
  maxOutputTokens: 256,
  temperature: 0,
};

describe('provider health checks', () => {
  it('mock providers report healthy with latency', async () => {
    const e = await checkEmbedding(mockEmbedding);
    expect(e.status).toBe('healthy');
    expect(e.ok).toBe(true);
    expect(e.latencyMs).toBeGreaterThanOrEqual(0);

    const r = await checkReranker(mockReranker);
    expect(r.status).toBe('healthy');

    const l = await checkLlm(mockLlm);
    expect(l.status).toBe('healthy');
  });

  it('missing production config reports not_configured', async () => {
    const result = await checkEmbedding({
      ...mockEmbedding,
      providerId: 'openai-compatible',
      endpoint: '',
      apiKey: undefined,
    });
    expect(result.status).toBe('not_configured');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('checkAll covers embedding, reranker, llm', async () => {
    const results = await checkAll();
    expect(results.map((r) => r.capability).sort()).toEqual(['embedding', 'llm', 'reranker']);
  });

  it('mock smoke is PASS without network', async () => {
    const report = await runProviderSmokeTest({
      EMBEDDING_PROVIDER: 'mock',
      RERANKER_PROVIDER: 'mock',
      LLM_PROVIDER: 'mock',
    });
    expect(report.mode).toBe('MOCK');
    expect(report.status).toBe('PASS');
  });

  it('unconfigured real provider smoke is SKIPPED_PROVIDER_UNAVAILABLE', async () => {
    const report = await runProviderSmokeTest({
      EMBEDDING_PROVIDER: 'openai-compatible',
      EMBEDDING_ENDPOINT: 'https://x.test',
      RERANKER_PROVIDER: 'mock',
      LLM_PROVIDER: 'mock',
    });
    expect(report.mode).toBe('SKIPPED');
    expect(report.status).toBe('SKIPPED_PROVIDER_UNAVAILABLE');
  });
});
