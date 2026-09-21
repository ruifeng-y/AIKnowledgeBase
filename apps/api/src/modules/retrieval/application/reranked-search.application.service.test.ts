import { describe, expect, it } from 'vitest';
import { EmbeddingError, mockVector } from '@akb/ai';
import type { EmbeddingProviderPort } from '@akb/ai';
import { RerankedSearchApplicationService } from './reranked-search.application.service';
import type { LexicalSearchRow } from '../domain/lexical-search.port';
import type { RerankInput, RerankResult, RerankerProviderPort } from '../domain/reranker.port';
import type { VectorSearchRow } from '../domain/vector-search.port';

const identity = { provider: 'mock', model: 'mock-embedding-v1', dimension: 8 };
const rerankerIdentity = { provider: 'mock', model: 'mock-reranker-v1' };

function makeEmbeddingProvider(overrides?: Partial<EmbeddingProviderPort>): EmbeddingProviderPort {
  return {
    identity: () => identity,
    embed: async ({ text }) => ({
      vector: mockVector(text, identity.dimension, identity.model),
      dimension: identity.dimension,
      model: identity.model,
    }),
    embedBatch: async (inputs) =>
      inputs.map((input) => ({
        vector: mockVector(input.text, identity.dimension, identity.model),
        dimension: identity.dimension,
        model: identity.model,
      })),
    ...overrides,
  };
}

function makeReranker(options?: {
  scores?: Record<string, number>;
  fail?: boolean;
  invalid?: boolean;
  calls?: RerankInput[][];
}): RerankerProviderPort {
  const calls = options?.calls ?? [];
  return {
    identity: () => rerankerIdentity,
    rerank: async (inputs) => {
      calls.push(inputs);
      if (options?.fail) {
        throw new Error('reranker down');
      }
      if (options?.invalid) {
        return [{ chunkId: 'unknown-chunk', score: 1 }];
      }
      return inputs.map((input, index): RerankResult => ({
        chunkId: input.chunkId,
        score: options?.scores?.[input.chunkId] ?? inputs.length - index,
      }));
    },
  };
}

function vrow(id: string, score = 0.5): VectorSearchRow {
  return {
    chunkId: id,
    documentId: 'doc',
    documentVersionId: 'ver',
    knowledgeSpaceId: 'space-1',
    content: `content-${id}`,
    chunkIndex: 0,
    score,
    metadata: {},
    embeddingProvider: identity.provider,
    embeddingModel: identity.model,
    embeddingDimension: identity.dimension,
  };
}

function lrow(id: string, score = 1): LexicalSearchRow {
  return {
    chunkId: id,
    documentId: 'doc',
    documentVersionId: 'ver',
    knowledgeSpaceId: 'space-1',
    content: `content-${id}`,
    chunkIndex: 0,
    score,
    metadata: {},
  };
}

function makeService(options?: {
  vectorRows?: VectorSearchRow[];
  lexicalRows?: LexicalSearchRow[];
  versionBelongs?: boolean;
  embeddingProvider?: EmbeddingProviderPort;
  rerankerProvider?: RerankerProviderPort;
  failLexical?: boolean;
  vectorCalls?: { topK?: number }[];
  lexicalCalls?: { candidateK?: number }[];
}) {
  const vectorCalls = options?.vectorCalls ?? [];
  const lexicalCalls = options?.lexicalCalls ?? [];
  const reranker = options?.rerankerProvider ?? makeReranker();
  const rerankInputs: RerankInput[][] = [];
  const service = new RerankedSearchApplicationService({
    authorization: { assertSpaceOwner: async () => ({ id: 'space-1' }) as never },
    vectorSearch: {
      search: async (params) => {
        vectorCalls.push({ topK: params.topK });
        return options?.vectorRows ?? [];
      },
      resolveCurrentVersionIds: async () => [],
      versionBelongsToSpace: async () => options?.versionBelongs ?? true,
    },
    lexicalSearch: {
      search: async (params) => {
        lexicalCalls.push({ candidateK: params.candidateK });
        if (options?.failLexical) {
          throw new Error('lexical down');
        }
        return options?.lexicalRows ?? [];
      },
    },
    embeddingProvider: options?.embeddingProvider ?? makeEmbeddingProvider(),
    rerankerProvider: {
      identity: () => rerankerIdentity,
      rerank: async (inputs) => {
        rerankInputs.push(inputs);
        return reranker.rerank(inputs);
      },
    },
  });
  return { service, vectorCalls, lexicalCalls, rerankInputs };
}

describe('RerankedSearchApplicationService', () => {
  it('pipeline: retrievalCandidateK → RRF → rerankCandidateK → reranker → topK', async () => {
    const manyVector = Array.from({ length: 30 }, (_, i) => vrow(`v${i}`, 0.9 - i * 0.01));
    const manyLex = Array.from({ length: 30 }, (_, i) => lrow(`l${i}`, 10 - i));
    const { service, vectorCalls, lexicalCalls, rerankInputs } = makeService({
      vectorRows: manyVector,
      lexicalRows: manyLex,
    });

    const result = await service.search('user', 'space-1', {
      query: 'jwt',
      topK: 10,
      retrievalCandidateK: 50,
      rerankCandidateK: 20,
      threshold: 0.3,
    });

    expect(vectorCalls[0]?.topK).toBe(50);
    expect(lexicalCalls[0]?.candidateK).toBe(50);
    expect(rerankInputs[0]).toHaveLength(20);
    expect(result.total).toBeLessThanOrEqual(10);
    expect(result.retrievalCandidateK).toBe(50);
    expect(result.rerankCandidateK).toBe(20);
    expect(result.topK).toBe(10);
    expect(result.provider).toBe('mock');
    expect(result.model).toBe('mock-reranker-v1');
  });

  it('empty hybrid candidates → reranker not called → 200 []', async () => {
    const { service, rerankInputs } = makeService({
      vectorRows: [],
      lexicalRows: [],
    });
    const result = await service.search('user', 'space-1', { query: 'jwt' });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(rerankInputs).toHaveLength(0);
  });

  it('partial routes still rerank', async () => {
    const onlyLex = makeService({ vectorRows: [], lexicalRows: [lrow('a'), lrow('b')] });
    const r1 = await onlyLex.service.search('user', 'space-1', { query: 'jwt' });
    expect(r1.total).toBeGreaterThan(0);

    const onlyVec = makeService({ vectorRows: [vrow('c')], lexicalRows: [] });
    const r2 = await onlyVec.service.search('user', 'space-1', { query: 'jwt' });
    expect(r2.total).toBe(1);
  });

  it('maps reranker scores and orders DESC chunkId ASC', async () => {
    const { service } = makeService({
      vectorRows: [vrow('chunk-a'), vrow('chunk-b'), vrow('chunk-c')],
      lexicalRows: [],
      rerankerProvider: makeReranker({
        scores: { 'chunk-a': 0.2, 'chunk-b': 0.9, 'chunk-c': 0.2 },
      }),
    });
    const result = await service.search('user', 'space-1', { query: 'jwt', topK: 10 });
    expect(result.items.map((i) => i.chunkId)).toEqual(['chunk-b', 'chunk-a', 'chunk-c']);
    expect(result.items[0]!.score).toBe(0.9);
    expect(result.items[0]).not.toHaveProperty('rrfScore');
  });

  it('constraint violations', async () => {
    const { service } = makeService();
    await expect(
      service.search('user', 'space-1', { query: 'jwt', topK: 20, rerankCandidateK: 10 }),
    ).rejects.toMatchObject({ code: 'INVALID_RERANK_CANDIDATE_K', httpStatus: 400 });
    await expect(
      service.search('user', 'space-1', {
        query: 'jwt',
        topK: 5,
        rerankCandidateK: 10,
        retrievalCandidateK: 8,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RERANK_CANDIDATE_K', httpStatus: 400 });
  });

  it('reranker failure → 500 no RRF fallback', async () => {
    const { service } = makeService({
      lexicalRows: [lrow('a')],
      rerankerProvider: makeReranker({ fail: true }),
    });
    await expect(service.search('user', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'RERANKER_PROVIDER_ERROR',
      httpStatus: 500,
    });
  });

  it('invalid reranker response → 500', async () => {
    const { service } = makeService({
      lexicalRows: [lrow('a')],
      rerankerProvider: makeReranker({ invalid: true }),
    });
    await expect(service.search('user', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'RERANKER_INVALID_RESPONSE',
      httpStatus: 500,
    });
  });

  it('embedding failure → 500', async () => {
    const { service } = makeService({
      embeddingProvider: makeEmbeddingProvider({
        embed: async () => {
          throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', 'down');
        },
      }),
      lexicalRows: [lrow('a')],
    });
    await expect(service.search('user', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'VECTOR_SEARCH_EMBEDDING_ERROR',
      httpStatus: 500,
    });
  });

  it('foreign version → 404', async () => {
    const { service } = makeService({ versionBelongs: false });
    await expect(
      service.search('user', 'space-1', { query: 'jwt', versionId: 'nope' }),
    ).rejects.toMatchObject({ code: 'VECTOR_SEARCH_VERSION_NOT_FOUND', httpStatus: 404 });
  });
});
