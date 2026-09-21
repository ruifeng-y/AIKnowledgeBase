import { describe, expect, it } from 'vitest';
import { MockEmbeddingProvider, MockLLMProvider, MockRerankerProvider } from './mock-ai-providers';

describe('Mock AI providers', () => {
  it('embedding is deterministic and offline', async () => {
    const provider = new MockEmbeddingProvider('mock-embedding', 8);
    const a = await provider.embed(['hello world']);
    const b = await provider.embed(['hello world']);
    expect(provider.dimensions()).toBe(8);
    expect(provider.model()).toBe('mock-embedding');
    expect(a[0]).toEqual(b[0]);
    expect(a[0]).toHaveLength(8);
  });

  it('reranker is deterministic and ordered by overlap', async () => {
    const provider = new MockRerankerProvider();
    const results = await provider.rerank('order service', [
      'unrelated text',
      'order service creation flow',
    ]);
    expect(results[0]?.index).toBe(1);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it('llm mock returns without network', async () => {
    const provider = new MockLLMProvider('mock-llm');
    const result = await provider.generate({ prompt: 'ping' });
    expect(result.model).toBe('mock-llm');
    expect(result.text).toContain('ping');
  });
});
