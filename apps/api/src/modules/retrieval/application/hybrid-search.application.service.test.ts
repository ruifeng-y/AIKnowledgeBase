import { describe, expect, it } from 'vitest';
import { EmbeddingError, mockVector } from '@akb/ai';
import type { EmbeddingProviderPort } from '@akb/ai';
import { HybridSearchApplicationService } from './hybrid-search.application.service';
import type { LexicalSearchParams, LexicalSearchRow } from '../domain/lexical-search.port';
import type { VectorSearchParams, VectorSearchRow } from '../domain/vector-search.port';

const identity = { provider: 'mock', model: 'mock-embedding-v1', dimension: 8 };

function makeProvider(overrides?: Partial<EmbeddingProviderPort>): EmbeddingProviderPort {
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

function makeVectorRow(id: string, score: number): VectorSearchRow {
  return {
    chunkId: id,
    documentId: 'doc-1',
    documentVersionId: 'ver-1',
    knowledgeSpaceId: 'space-1',
    content: `v-${id}`,
    chunkIndex: 0,
    score,
    metadata: { source: 'vector' },
    embeddingProvider: identity.provider,
    embeddingModel: identity.model,
    embeddingDimension: identity.dimension,
  };
}

function makeLexicalRow(id: string, score: number): LexicalSearchRow {
  return {
    chunkId: id,
    documentId: 'doc-2',
    documentVersionId: 'ver-1',
    knowledgeSpaceId: 'space-1',
    content: `l-${id}`,
    chunkIndex: 1,
    score,
    metadata: { source: 'lexical' },
  };
}

function makeService(options?: {
  versionBelongs?: boolean;
  vectorRows?: VectorSearchRow[];
  lexicalRows?: LexicalSearchRow[];
  provider?: EmbeddingProviderPort;
  vectorCalls?: VectorSearchParams[];
  lexicalCalls?: LexicalSearchParams[];
  failVector?: boolean;
  failLexical?: boolean;
}) {
  const vectorCalls = options?.vectorCalls ?? [];
  const lexicalCalls = options?.lexicalCalls ?? [];
  const service = new HybridSearchApplicationService({
    authorization: {
      assertSpaceOwner: async () => ({ id: 'space-1' }) as never,
    },
    vectorSearch: {
      search: async (params) => {
        vectorCalls.push(params);
        if (options?.failVector) {
          throw new Error('vector route down');
        }
        return options?.vectorRows ?? [];
      },
      resolveCurrentVersionIds: async () => [],
      versionBelongsToSpace: async () => options?.versionBelongs ?? true,
    },
    lexicalSearch: {
      search: async (params) => {
        lexicalCalls.push(params);
        if (options?.failLexical) {
          throw new Error('lexical route down');
        }
        return options?.lexicalRows ?? [];
      },
    },
    embeddingProvider: options?.provider ?? makeProvider(),
  });
  return { service, vectorCalls, lexicalCalls };
}

describe('HybridSearchApplicationService', () => {
  it('returns empty 200 contract when both routes empty', async () => {
    const { service } = makeService();
    const result = await service.search('user-1', 'space-1', { query: 'jwt auth' });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.topK).toBe(10);
    expect(result.candidateK).toBe(50);
    expect(result.threshold).toBe(0.3);
  });

  it('passes candidateK to both routes and fuses dual-route hits', async () => {
    const { service, vectorCalls, lexicalCalls } = makeService({
      vectorRows: [makeVectorRow('chunk-shared', 0.9), makeVectorRow('chunk-v', 0.8)],
      lexicalRows: [makeLexicalRow('chunk-shared', 3), makeLexicalRow('chunk-l', 2)],
    });
    const result = await service.search('user-1', 'space-1', {
      query: 'jwt',
      topK: 10,
      candidateK: 50,
      threshold: 0.3,
    });

    expect(vectorCalls[0]?.topK).toBe(50);
    expect(vectorCalls[0]?.threshold).toBe(0.3);
    expect(lexicalCalls[0]?.candidateK).toBe(50);
    expect(result.candidateK).toBe(50);

    const shared = result.items.find((i) => i.chunkId === 'chunk-shared');
    const onlyV = result.items.find((i) => i.chunkId === 'chunk-v');
    const onlyL = result.items.find((i) => i.chunkId === 'chunk-l');
    expect(shared).toBeDefined();
    // dual contribution
    expect(shared!.score).toBeCloseTo(1 / 61 + 1 / 61, 12);
    expect(onlyV!.score).toBeCloseTo(1 / 62, 12);
    expect(onlyL!.score).toBeCloseTo(1 / 62, 12);
    // public score is rrf only; no diagnostic fields
    expect(Object.keys(shared!)).toEqual([
      'chunkId',
      'documentId',
      'documentVersionId',
      'knowledgeSpaceId',
      'content',
      'score',
      'metadata',
    ]);
    expect(result.total).toBeLessThanOrEqual(result.topK);
  });

  it('rejects candidateK < topK', async () => {
    const { service } = makeService();
    await expect(
      service.search('user-1', 'space-1', { query: 'jwt', topK: 20, candidateK: 10 }),
    ).rejects.toMatchObject({ code: 'INVALID_SEARCH_CANDIDATE_K', httpStatus: 400 });
  });

  it('rejects foreign version with 404', async () => {
    const { service } = makeService({ versionBelongs: false });
    await expect(
      service.search('user-1', 'space-1', { query: 'jwt', versionId: 'foreign' }),
    ).rejects.toMatchObject({
      code: 'VECTOR_SEARCH_VERSION_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('maps embedding failure to 500 without silent lexical-only', async () => {
    const { service } = makeService({
      provider: makeProvider({
        embed: async () => {
          throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', 'down');
        },
      }),
      lexicalRows: [makeLexicalRow('a', 1)],
    });
    await expect(service.search('user-1', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'VECTOR_SEARCH_EMBEDDING_ERROR',
      httpStatus: 500,
    });
  });

  it('maps lexical route failure to 500 without silent vector-only', async () => {
    const { service } = makeService({
      failLexical: true,
      vectorRows: [makeVectorRow('a', 0.9)],
    });
    await expect(service.search('user-1', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'HYBRID_SEARCH_LEXICAL_ERROR',
      httpStatus: 500,
    });
  });

  it('allows partial route success when both routes execute', async () => {
    const { service } = makeService({
      vectorRows: [],
      lexicalRows: [makeLexicalRow('only-l', 1)],
    });
    const result = await service.search('user-1', 'space-1', { query: 'jwt' });
    expect(result.total).toBe(1);
    expect(result.items[0]!.chunkId).toBe('only-l');
  });
});
