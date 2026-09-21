import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RERANKER_IDENTITY,
  DEFAULT_RERANKER_BATCH_SIZE,
  mockRerankScore,
  MockRerankerProvider,
  RerankerError,
  sliceRerankBatches,
  validateRerankResults,
  type RerankInput,
} from './reranker.port';
import {
  DEFAULT_FINAL_TOP_K,
  DEFAULT_RERANK_CANDIDATE_K,
  DEFAULT_RETRIEVAL_CANDIDATE_K,
  normalizeFinalTopK,
  normalizeRerankCandidateK,
  normalizeRerankedThreshold,
  normalizeRetrievalCandidateK,
  RerankedSearchError,
  sortRerankedCandidates,
  validateRerankedQuery,
  type RankedRerankCandidate,
} from './reranked-search.port';

function input(chunkId: string, content = 'content'): RerankInput {
  return { query: 'jwt authentication', chunkId, content };
}

function ranked(chunkId: string, score: number): RankedRerankCandidate {
  return {
    chunkId,
    documentId: 'd',
    documentVersionId: 'v',
    knowledgeSpaceId: 's',
    content: 'c',
    chunkIndex: 0,
    metadata: {},
    vectorRank: null,
    lexicalRank: null,
    vectorScore: null,
    lexicalScore: null,
    rrfScore: 0,
    rerankerScore: score,
  };
}

describe('reranker domain', () => {
  it('identity defaults and mock determinism', async () => {
    expect(DEFAULT_RERANKER_IDENTITY.provider).toBe('mock');
    expect(DEFAULT_RERANKER_IDENTITY.model).toBe('mock-reranker-v1');
    const provider = new MockRerankerProvider();
    expect(provider.identity()).toEqual(DEFAULT_RERANKER_IDENTITY);
    const a = await provider.rerank([input('c1', 'jwt auth'), input('c2', 'other')]);
    const b = await provider.rerank([input('c1', 'jwt auth'), input('c2', 'other')]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    for (const r of a) {
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });

  it('batch splitting with default size 16', () => {
    expect(DEFAULT_RERANKER_BATCH_SIZE).toBe(16);
    const items = Array.from({ length: 20 }, (_, i) => i);
    const batches = sliceRerankBatches(items, 16);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(16);
    expect(batches[1]).toHaveLength(4);
    expect(() => sliceRerankBatches(items, 0)).toThrow(RerankerError);
    expect(() => sliceRerankBatches(items, 33)).toThrow(RerankerError);
  });

  it('mock scores token overlap deterministically without claiming semantics', () => {
    const s1 = mockRerankScore('jwt authentication', 'a', 'jwt authentication token');
    const s2 = mockRerankScore('jwt authentication', 'a', 'jwt authentication token');
    const unrelated = mockRerankScore('jwt authentication', 'b', 'completely other words');
    expect(s1).toBe(s2);
    expect(s1).toBeGreaterThan(unrelated);
  });

  it('validates rerank response contract', () => {
    const inputs = [input('a'), input('b')];
    expect(() =>
      validateRerankResults(inputs, [
        { chunkId: 'a', score: 1 },
        { chunkId: 'b', score: 2 },
      ]),
    ).not.toThrow();

    expect(() => validateRerankResults(inputs, [{ chunkId: 'a', score: 1 }])).toThrow(
      /missing|returned/i,
    );

    expect(() =>
      validateRerankResults(inputs, [
        { chunkId: 'a', score: 1 },
        { chunkId: 'unknown', score: 2 },
      ]),
    ).toThrow(/unknown/i);

    expect(() =>
      validateRerankResults(inputs, [
        { chunkId: 'a', score: 1 },
        { chunkId: 'a', score: 2 },
      ]),
    ).toThrow(/duplicate/i);

    expect(() =>
      validateRerankResults(inputs, [
        { chunkId: 'a', score: Number.NaN },
        { chunkId: 'b', score: 1 },
      ]),
    ).toThrow(/finite/i);

    expect(() =>
      validateRerankResults(inputs, [
        { chunkId: 'a', score: Number.POSITIVE_INFINITY },
        { chunkId: 'b', score: 1 },
      ]),
    ).toThrow(/finite/i);
  });
});

describe('reranked search validation', () => {
  it('defaults and candidate constraint chain', () => {
    expect(DEFAULT_FINAL_TOP_K).toBe(10);
    expect(DEFAULT_RERANK_CANDIDATE_K).toBe(20);
    expect(DEFAULT_RETRIEVAL_CANDIDATE_K).toBe(50);
    expect(normalizeFinalTopK(undefined)).toBe(10);
    expect(normalizeRerankCandidateK(undefined, 10)).toBe(20);
    expect(normalizeRetrievalCandidateK(undefined, 20)).toBe(50);

    expect(normalizeFinalTopK(1)).toBe(1);
    expect(normalizeFinalTopK(50)).toBe(50);
    expect(() => normalizeFinalTopK(0)).toThrow(RerankedSearchError);
    expect(() => normalizeFinalTopK(51)).toThrow(RerankedSearchError);

    expect(normalizeRerankCandidateK(1, 1)).toBe(1);
    expect(normalizeRerankCandidateK(50, 10)).toBe(50);
    expect(() => normalizeRerankCandidateK(0, 10)).toThrow(RerankedSearchError);
    expect(() => normalizeRerankCandidateK(51, 10)).toThrow(RerankedSearchError);
    expect(() => normalizeRerankCandidateK(5, 10)).toThrow(/rerankCandidateK/);

    expect(normalizeRetrievalCandidateK(1, 1)).toBe(1);
    expect(normalizeRetrievalCandidateK(100, 20)).toBe(100);
    expect(() => normalizeRetrievalCandidateK(0, 10)).toThrow(RerankedSearchError);
    expect(() => normalizeRetrievalCandidateK(101, 10)).toThrow(RerankedSearchError);
    expect(() => normalizeRetrievalCandidateK(10, 20)).toThrow(/retrievalCandidateK/);

    expect(normalizeRerankedThreshold(undefined)).toBe(0.3);
    expect(normalizeRerankedThreshold(-1)).toBe(-1);
    expect(normalizeRerankedThreshold(1)).toBe(1);
    expect(() => normalizeRerankedThreshold(-1.1)).toThrow(RerankedSearchError);
    expect(() => normalizeRerankedThreshold(1.1)).toThrow(RerankedSearchError);
    expect(() => validateRerankedQuery('   ')).toThrow(/empty/i);
  });

  it('orders by rerankerScore DESC then chunkId ASC', () => {
    const sorted = sortRerankedCandidates([ranked('b', 0.5), ranked('a', 0.9), ranked('c', 0.5)]);
    expect(sorted.map((r) => r.chunkId)).toEqual(['a', 'b', 'c']);
  });
});
