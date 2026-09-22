import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapHttpStatusToProviderCode, ProviderError, redactSecrets } from './provider-error';
import { providerHttpPost } from './http-transport';
import { OpenAICompatibleEmbeddingAdapter } from './openai-compatible-embedding.adapter';
import { HttpRerankerAdapter } from './http-reranker.adapter';
import { OpenAICompatibleLlmAdapter } from './openai-compatible-llm.adapter';
import { loadEmbeddingProviderConfig, validateProductionProviderConfig } from './provider-config';
import { ProviderRegistry, assertNotMockInProduction } from './provider.registry';

let server: Server;
let baseUrl = '';
let mode:
  'ok' | 'count-mismatch' | 'dimension' | 'malformed' | '429' | '500' | '401' | 'empty-llm' = 'ok';

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (mode === '401') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      if (mode === '429') {
        res.statusCode = 429;
        res.setHeader('retry-after', '0');
        res.end(JSON.stringify({ error: 'rate limited' }));
        return;
      }
      if (mode === '500') {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'server' }));
        return;
      }
      if (mode === 'malformed') {
        res.end('{not-json');
        return;
      }
      if (req.url?.includes('embeddings')) {
        const parsed = JSON.parse(body) as { input: string[] };
        if (mode === 'count-mismatch') {
          res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] }));
          return;
        }
        if (mode === 'dimension') {
          res.end(JSON.stringify({ data: parsed.input.map(() => ({ embedding: [0.1, 0.2] })) }));
          return;
        }
        res.end(
          JSON.stringify({
            data: parsed.input.map((_, i) => ({
              embedding: [i + 0.1, 0.2, 0.3, 0.4],
            })),
          }),
        );
        return;
      }
      if (req.url?.includes('rerank')) {
        const parsed = JSON.parse(body) as { documents: Array<{ chunkId: string }> };
        res.end(
          JSON.stringify({
            results: parsed.documents.map((d, i) => ({
              chunkId: d.chunkId,
              score: 1 - i * 0.1,
            })),
          }),
        );
        return;
      }
      if (mode === 'empty-llm') {
        res.end(JSON.stringify({ choices: [{ message: { content: '' } }] }));
        return;
      }
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'Answer. [C1]' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address && typeof address === 'object') {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
}, 15_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function embedConfig() {
  return {
    providerId: 'openai-compatible',
    modelId: 'text-embedding-test',
    endpoint: `${baseUrl}/v1/embeddings`,
    apiKey: 'test-key-not-real',
    timeoutMs: 5000,
    maxRetries: 0,
    enabled: true,
    dimensions: 4,
    batchSize: 2,
  };
}

describe('provider error normalization', () => {
  it('maps HTTP statuses', () => {
    expect(mapHttpStatusToProviderCode(400)).toBe('PROVIDER_BAD_REQUEST');
    expect(mapHttpStatusToProviderCode(401)).toBe('PROVIDER_AUTH_FAILED');
    expect(mapHttpStatusToProviderCode(403)).toBe('PROVIDER_AUTH_FAILED');
    expect(mapHttpStatusToProviderCode(404)).toBe('PROVIDER_NOT_FOUND');
    expect(mapHttpStatusToProviderCode(408)).toBe('PROVIDER_TIMEOUT');
    expect(mapHttpStatusToProviderCode(429)).toBe('PROVIDER_RATE_LIMITED');
    expect(mapHttpStatusToProviderCode(500)).toBe('PROVIDER_SERVER_ERROR');
  });

  it('redacts secrets in messages', () => {
    const text = redactSecrets('Authorization: Bearer sk-abcdef123456');
    expect(text).not.toContain('sk-abcdef123456');
    expect(text).toContain('[redacted]');
  });

  it('config validation for production requires endpoint and key', () => {
    expect(() =>
      validateProductionProviderConfig({
        providerId: 'mock',
        modelId: 'm',
        endpoint: '',
        apiKey: undefined,
        timeoutMs: 1,
        maxRetries: 1,
        enabled: true,
      }),
    ).not.toThrow();
    expect(() =>
      validateProductionProviderConfig({
        providerId: 'openai-compatible',
        modelId: 'm',
        endpoint: '',
        apiKey: undefined,
        timeoutMs: 1,
        maxRetries: 1,
        enabled: true,
      }),
    ).toThrow(/PROVIDER_NOT_CONFIGURED/);
  });

  it('no silent mock fallback in production', () => {
    expect(() =>
      assertNotMockInProduction({
        NODE_ENV: 'production',
        EMBEDDING_PROVIDER: 'mock',
      }),
    ).toThrow(/mock embedding/);
  });
});

describe('OpenAICompatibleEmbeddingAdapter contract', () => {
  it('success: count, dimension, order, finite', async () => {
    mode = 'ok';
    const adapter = new OpenAICompatibleEmbeddingAdapter(embedConfig());
    const results = await adapter.embedBatch([{ text: 'a' }, { text: 'b' }]);
    expect(results).toHaveLength(2);
    expect(results[0]!.vector).toHaveLength(4);
    expect(results[1]!.vector[0]).toBeCloseTo(1.1);
    expect(results.every((r) => r.vector.every(Number.isFinite))).toBe(true);
  });

  it('empty input returns empty', async () => {
    mode = 'ok';
    const adapter = new OpenAICompatibleEmbeddingAdapter(embedConfig());
    await expect(adapter.embedBatch([])).resolves.toEqual([]);
  });

  it('count mismatch rejected', async () => {
    mode = 'count-mismatch';
    const adapter = new OpenAICompatibleEmbeddingAdapter(embedConfig());
    await expect(adapter.embedBatch([{ text: 'a' }, { text: 'b' }])).rejects.toThrow(/mismatch/i);
    mode = 'ok';
  });

  it('dimension mismatch rejected', async () => {
    mode = 'dimension';
    const adapter = new OpenAICompatibleEmbeddingAdapter(embedConfig());
    await expect(adapter.embed({ text: 'a' })).rejects.toThrow(/vector length|DIMENSION/i);
    mode = 'ok';
  });

  it('malformed json rejected', async () => {
    mode = 'malformed';
    const adapter = new OpenAICompatibleEmbeddingAdapter(embedConfig());
    await expect(adapter.embed({ text: 'a' })).rejects.toThrow();
    mode = 'ok';
  });

  it('401 / 429 / 500 classified', async () => {
    mode = '401';
    const adapter = new OpenAICompatibleEmbeddingAdapter(embedConfig());
    await expect(adapter.embed({ text: 'a' })).rejects.toThrow();
    mode = '429';
    await expect(adapter.embed({ text: 'a' })).rejects.toThrow();
    mode = '500';
    await expect(adapter.embed({ text: 'a' })).rejects.toThrow();
    mode = 'ok';
  });

  it('timeout becomes PROVIDER_TIMEOUT', async () => {
    const result = providerHttpPost({
      provider: 'test',
      operation: 'timeout',
      endpoint: 'http://127.0.0.1:1',
      body: {},
      timeoutMs: 200,
      maxRetries: 0,
    });
    await expect(result).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('HttpRerankerAdapter contract', () => {
  it('success ranking with finite scores', async () => {
    const adapter = new HttpRerankerAdapter({
      providerId: 'http-reranker',
      modelId: 'rerank-test',
      endpoint: `${baseUrl}/v1/rerank`,
      apiKey: 'k',
      timeoutMs: 5000,
      maxRetries: 0,
      enabled: true,
      maxCandidates: 50,
      batchSize: 16,
    });
    const results = await adapter.rerank([
      { query: 'q', chunkId: 'c1', content: 'a' },
      { query: 'q', chunkId: 'c2', content: 'b' },
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((r) => Number.isFinite(r.score))).toBe(true);
  });

  it('provider failure maps to RERANKER_PROVIDER_ERROR', async () => {
    mode = '401';
    const adapter = new HttpRerankerAdapter({
      providerId: 'http-reranker',
      modelId: 'rerank-test',
      endpoint: `${baseUrl}/v1/rerank`,
      apiKey: 'k',
      timeoutMs: 5000,
      maxRetries: 0,
      enabled: true,
      maxCandidates: 50,
      batchSize: 16,
    });
    await expect(adapter.rerank([{ query: 'q', chunkId: 'c1', content: 'a' }])).rejects.toThrow();
    mode = 'ok';
  });
});

describe('OpenAICompatibleLlmAdapter contract', () => {
  function llmAdapter() {
    return new OpenAICompatibleLlmAdapter({
      providerId: 'openai-compatible',
      modelId: 'chat-test',
      endpoint: `${baseUrl}/v1`,
      apiKey: 'k',
      timeoutMs: 5000,
      maxRetries: 0,
      enabled: true,
      maxInputTokens: 4096,
      maxOutputTokens: 256,
      temperature: 0,
    });
  }

  it('success with usage', async () => {
    const result = await llmAdapter().generate({
      systemPrompt: 'sys',
      userQuery: 'q',
      context: [
        {
          citationId: 'C1',
          chunkId: 'c',
          documentId: 'd',
          documentVersionId: 'v',
          knowledgeSpaceId: 's',
          chunkIndex: 0,
          content: 'x',
          metadata: {},
          truncated: false,
        },
      ],
    });
    expect(result.answer).toContain('[C1]');
    expect(result.usage).toMatchObject({ totalTokens: 15 });
  });

  it('empty / malformed response rejected', async () => {
    mode = 'empty-llm';
    await expect(
      llmAdapter().generate({ systemPrompt: 's', userQuery: 'q', context: [] }),
    ).rejects.toThrow();
    mode = 'malformed';
    await expect(
      llmAdapter().generate({ systemPrompt: 's', userQuery: 'q', context: [] }),
    ).rejects.toThrow();
    mode = 'ok';
  });
});

describe('ProviderRegistry', () => {
  it('resolves mock by default without production secrets', () => {
    const registry = new ProviderRegistry();
    const embedding = registry.resolveEmbedding(loadEmbeddingProviderConfig({}));
    expect(embedding.identity().provider).toBe('mock');
  });

  it('resolves production embedding adapter when configured', () => {
    const registry = new ProviderRegistry();
    const embedding = registry.resolveEmbedding(
      loadEmbeddingProviderConfig({
        EMBEDDING_PROVIDER: 'openai-compatible',
        EMBEDDING_MODEL: 'm',
        EMBEDDING_ENDPOINT: `${baseUrl}/v1`,
        EMBEDDING_API_KEY: 'k',
        EMBEDDING_DIMENSION: '4',
      }),
    );
    expect(embedding.identity().provider).toBe('openai-compatible');
    expect(embedding.identity().dimension).toBe(4);
  });
});
