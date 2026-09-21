import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBEDDING_CONFIG,
  EmbeddingError,
  MockEmbeddingProvider,
  validateEmbeddingVector,
} from '@akb/ai';

describe('Embedding provider contracts (offline)', () => {
  const config = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 16, batchSize: 2 };
  const provider = new MockEmbeddingProvider(config);

  it('rejects empty content', async () => {
    await expect(provider.embed({ text: '  ' })).rejects.toMatchObject({
      code: 'EMBEDDING_EMPTY_CONTENT',
    });
  });

  it('deterministic vectors', async () => {
    const a = await provider.embed({ text: 'chunk content' });
    const b = await provider.embed({ text: 'chunk content' });
    expect(a.vector).toEqual(b.vector);
  });

  it('model identity isolation', async () => {
    const m1 = new MockEmbeddingProvider({ ...config, model: 'mock-a' });
    const m2 = new MockEmbeddingProvider({ ...config, model: 'mock-b' });
    const v1 = await m1.embed({ text: 'same' });
    const v2 = await m2.embed({ text: 'same' });
    expect(v1.vector).not.toEqual(v2.vector);
  });

  it('NaN vector rejected', () => {
    const bad = new Array<number>(16).fill(0);
    bad[0] = Number.NaN;
    expect(() => validateEmbeddingVector(bad, 16)).toThrow(EmbeddingError);
  });
});
