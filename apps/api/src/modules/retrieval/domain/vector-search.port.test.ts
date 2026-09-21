import { describe, expect, it } from 'vitest';
import {
  cosineScoreFromDistance,
  normalizeThreshold,
  normalizeTopK,
  sortVectorSearchRows,
  validateSearchQuery,
  VectorSearchError,
  type VectorSearchRow,
} from './vector-search.port';

function row(id: string, score: number): VectorSearchRow {
  return {
    chunkId: id,
    documentId: 'd',
    documentVersionId: 'v',
    knowledgeSpaceId: 's',
    content: 'c',
    chunkIndex: 0,
    score,
    metadata: {},
    embeddingProvider: 'mock',
    embeddingModel: 'm',
    embeddingDimension: 8,
  };
}

describe('vector search contract helpers', () => {
  it('defaults topK and threshold', () => {
    expect(normalizeTopK(undefined)).toBe(10);
    expect(normalizeThreshold(undefined)).toBe(0.3);
  });

  it('validates topK bounds', () => {
    expect(normalizeTopK(1)).toBe(1);
    expect(normalizeTopK(50)).toBe(50);
    expect(() => normalizeTopK(0)).toThrow(VectorSearchError);
    expect(() => normalizeTopK(51)).toThrow(VectorSearchError);
  });

  it('validates threshold bounds', () => {
    expect(normalizeThreshold(-1)).toBe(-1);
    expect(normalizeThreshold(1)).toBe(1);
    expect(() => normalizeThreshold(-1.1)).toThrow(VectorSearchError);
    expect(() => normalizeThreshold(1.1)).toThrow(VectorSearchError);
  });

  it('rejects empty query', () => {
    expect(() => validateSearchQuery('   ')).toThrow(/empty/i);
  });

  it('score = 1 - cosine_distance', () => {
    expect(cosineScoreFromDistance(0)).toBe(1);
    expect(cosineScoreFromDistance(0.7)).toBeCloseTo(0.3);
    expect(cosineScoreFromDistance(2)).toBe(-1);
  });

  it('orders score DESC then chunkId ASC', () => {
    const sorted = sortVectorSearchRows([row('b', 0.5), row('a', 0.9), row('c', 0.5)]);
    expect(sorted.map((r) => r.chunkId)).toEqual(['a', 'b', 'c']);
  });
});
