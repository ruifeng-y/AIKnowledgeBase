import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBEDDING_CONFIG,
  EmbeddingError,
  MockEmbeddingProvider,
  validateEmbeddingVector,
} from './index';

describe('@akb/ai embedding foundation', () => {
  const config = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 16, batchSize: 2 };

  it('deterministic same text', async () => {
    const provider = new MockEmbeddingProvider(config);
    const a = await provider.embed({ text: 'hello' });
    const b = await provider.embed({ text: 'hello' });
    expect(a.vector).toEqual(b.vector);
  });

  it('different text differs', async () => {
    const provider = new MockEmbeddingProvider(config);
    const a = await provider.embed({ text: 'hello' });
    const b = await provider.embed({ text: 'world' });
    expect(a.vector).not.toEqual(b.vector);
  });

  it('empty content fails', async () => {
    const provider = new MockEmbeddingProvider(config);
    await expect(provider.embed({ text: '  ' })).rejects.toBeInstanceOf(EmbeddingError);
  });

  it('dimension mismatch validation', () => {
    expect(() => validateEmbeddingVector([1, 2], 16)).toThrow(EmbeddingError);
  });
});
