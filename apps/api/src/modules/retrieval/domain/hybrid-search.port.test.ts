import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HYBRID_CANDIDATE_K,
  DEFAULT_HYBRID_THRESHOLD,
  DEFAULT_HYBRID_TOP_K,
  fuseHybridCandidates,
  HybridSearchError,
  MAX_HYBRID_CANDIDATE_K,
  MAX_HYBRID_TOP_K,
  normalizeCandidateK,
  normalizeHybridThreshold,
  normalizeHybridTopK,
  rrfContribution,
  RRF_K,
  validateHybridQuery,
} from './hybrid-search.port';
import type { VectorSearchRow } from './vector-search.port';
import type { LexicalSearchRow } from './lexical-search.port';

function vrow(id: string, score: number): VectorSearchRow {
  return {
    chunkId: id,
    documentId: 'd',
    documentVersionId: 'v',
    knowledgeSpaceId: 's',
    content: `content-${id}`,
    chunkIndex: 0,
    score,
    metadata: {},
    embeddingProvider: 'mock',
    embeddingModel: 'm',
    embeddingDimension: 8,
  };
}

function lrow(id: string, score: number): LexicalSearchRow {
  return {
    chunkId: id,
    documentId: 'd',
    documentVersionId: 'v',
    knowledgeSpaceId: 's',
    content: `content-${id}`,
    chunkIndex: 0,
    score,
    metadata: {},
  };
}

describe('hybrid search contract helpers', () => {
  it('defaults topK / candidateK / threshold / rrfK', () => {
    expect(DEFAULT_HYBRID_TOP_K).toBe(10);
    expect(DEFAULT_HYBRID_CANDIDATE_K).toBe(50);
    expect(DEFAULT_HYBRID_THRESHOLD).toBe(0.3);
    expect(RRF_K).toBe(60);
    expect(MAX_HYBRID_TOP_K).toBe(50);
    expect(MAX_HYBRID_CANDIDATE_K).toBe(100);
  });

  it('validates topK and candidateK bounds', () => {
    expect(normalizeHybridTopK(undefined)).toBe(10);
    expect(normalizeHybridTopK(1)).toBe(1);
    expect(normalizeHybridTopK(50)).toBe(50);
    expect(() => normalizeHybridTopK(0)).toThrow(HybridSearchError);
    expect(() => normalizeHybridTopK(51)).toThrow(HybridSearchError);

    expect(normalizeCandidateK(undefined, 10)).toBe(50);
    expect(normalizeCandidateK(1, 1)).toBe(1);
    expect(normalizeCandidateK(100, 50)).toBe(100);
    expect(() => normalizeCandidateK(0, 10)).toThrow(HybridSearchError);
    expect(() => normalizeCandidateK(101, 10)).toThrow(HybridSearchError);
    expect(() => normalizeCandidateK(40, 50)).toThrow(/candidateK/);
  });

  it('validates threshold and query', () => {
    expect(normalizeHybridThreshold(undefined)).toBe(0.3);
    expect(normalizeHybridThreshold(-1)).toBe(-1);
    expect(normalizeHybridThreshold(0)).toBe(0);
    expect(normalizeHybridThreshold(1)).toBe(1);
    expect(() => normalizeHybridThreshold(-1.1)).toThrow(HybridSearchError);
    expect(() => normalizeHybridThreshold(1.1)).toThrow(HybridSearchError);
    expect(() => validateHybridQuery('   ')).toThrow(HybridSearchError);
    expect(validateHybridQuery(' jwt auth ')).toBe('jwt auth');
  });

  it('RRF: rank starts at 1 and rrfK = 60', () => {
    expect(rrfContribution(1)).toBeCloseTo(1 / 61, 12);
    expect(rrfContribution(2)).toBeCloseTo(1 / 62, 12);
    expect(rrfContribution(3)).toBeCloseTo(1 / 63, 12);
  });

  it('RRF: single-route and dual-route scoring', () => {
    const fused = fuseHybridCandidates(
      [vrow('a', 0.9), vrow('b', 0.8), vrow('c', 0.7)],
      [lrow('b', 2.0), lrow('d', 1.0), lrow('a', 0.5)],
    );
    const byId = Object.fromEntries(fused.map((r) => [r.chunkId, r]));

    // dual-route: sum both contributions
    expect(byId['a']!.rrfScore).toBeCloseTo(1 / 61 + 1 / 63, 12);
    expect(byId['b']!.rrfScore).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(byId['c']!.rrfScore).toBeCloseTo(1 / 63, 12);
    expect(byId['d']!.rrfScore).toBeCloseTo(1 / 62, 12);

    expect(byId['a']!.vectorRank).toBe(1);
    expect(byId['a']!.lexicalRank).toBe(3);
    expect(byId['c']!.lexicalRank).toBeNull();
  });

  it('RRF: dedup by chunkId only one final row', () => {
    const fused = fuseHybridCandidates([vrow('same', 1)], [lrow('same', 9)]);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.chunkId).toBe('same');
    expect(fused[0]!.rrfScore).toBeCloseTo(1 / 61 + 1 / 61, 12);
  });

  it('RRF: ordering rrfScore DESC then chunkId ASC', () => {
    const fused = fuseHybridCandidates([vrow('z', 0.5), vrow('y', 0.5)], []);
    expect(fused.map((r) => r.chunkId)).toEqual(['z', 'y']);

    const equal = fuseHybridCandidates([vrow('chunk-b', 0)], [lrow('chunk-a', 0)]);
    expect(equal.map((r) => r.chunkId)).toEqual(['chunk-a', 'chunk-b']);
  });

  it('RRF: empty routes yield empty result', () => {
    expect(fuseHybridCandidates([], [])).toEqual([]);
  });

  it('partial routes still produce ranked candidates', () => {
    const onlyLex = fuseHybridCandidates([], [lrow('a', 1), lrow('b', 0.5)]);
    expect(onlyLex).toHaveLength(2);
    expect(onlyLex[0]!.rrfScore).toBeCloseTo(1 / 61, 12);
    expect(onlyLex[1]!.rrfScore).toBeCloseTo(1 / 62, 12);

    const onlyVec = fuseHybridCandidates([vrow('c', 0.9)], []);
    expect(onlyVec).toHaveLength(1);
    expect(onlyVec[0]!.vectorRank).toBe(1);
  });
});
