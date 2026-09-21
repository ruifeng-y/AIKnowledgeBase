import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EMBEDDING_CONFIG,
  EmbeddingError,
  loadEmbeddingConfig,
  validateEmbeddingModelConfig,
  validateEmbeddingVector,
} from './index';
import { MockEmbeddingProvider } from './mock-embedding.provider';

const config = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 384, batchSize: 32 };

describe('MockEmbeddingProvider', () => {
  const provider = new MockEmbeddingProvider(config);

  it('same text produces identical vector', async () => {
    const a = await provider.embed({ text: 'hello' });
    const b = await provider.embed({ text: 'hello' });
    expect(a.vector).toEqual(b.vector);
    expect(a.dimension).toBe(384);
    expect(a.model).toBe(config.model);
  });

  it('different text produces different vector', async () => {
    const a = await provider.embed({ text: 'hello' });
    const b = await provider.embed({ text: 'world' });
    expect(a.vector).not.toEqual(b.vector);
  });

  it('has finite values and stable dimension', async () => {
    const result = await provider.embed({ text: 'finite check' });
    expect(result.vector).toHaveLength(384);
    expect(result.vector.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('rejects empty content', async () => {
    await expect(provider.embed({ text: '   ' })).rejects.toMatchObject({
      code: 'EMBEDDING_EMPTY_CONTENT',
    });
  });

  it('batch embeds and validates', async () => {
    const batch = await provider.embedBatch([{ text: 'a' }, { text: 'b' }]);
    expect(batch).toHaveLength(2);
    expect(batch[0]!.vector).toHaveLength(384);
  });
});

describe('embedding validation', () => {
  it('rejects dimension mismatch', () => {
    expect(() => validateEmbeddingVector([1, 2, 3], 384)).toThrow(EmbeddingError);
  });

  it('rejects NaN / Infinity', () => {
    const bad = new Array<number>(384).fill(0);
    bad[0] = Number.NaN;
    expect(() => validateEmbeddingVector(bad, 384)).toThrow(/non-finite/i);
    bad[0] = Number.POSITIVE_INFINITY;
    expect(() => validateEmbeddingVector(bad, 384)).toThrow(/non-finite/i);
  });

  it('validates model config', () => {
    expect(() =>
      validateEmbeddingModelConfig({ provider: 'mock', model: '', dimension: 384, batchSize: 32 }),
    ).toThrow(/provider/i);
    expect(() =>
      validateEmbeddingModelConfig({ provider: 'mock', model: 'm', dimension: 0, batchSize: 32 }),
    ).toThrow(/dimension/i);
  });

  it('loads config from env', () => {
    const cfg = loadEmbeddingConfig({
      EMBEDDING_PROVIDER: 'mock',
      EMBEDDING_MODEL: 'mock-embedding-v1',
      EMBEDDING_DIMENSION: '384',
      EMBEDDING_BATCH_SIZE: '32',
    });
    expect(cfg).toEqual({
      provider: 'mock',
      model: 'mock-embedding-v1',
      dimension: 384,
      batchSize: 32,
    });
  });
});
