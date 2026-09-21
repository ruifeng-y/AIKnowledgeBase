import { describe, expect, it } from 'vitest';
import { EmbeddingError, mockVector } from '@akb/ai';
import type { EmbeddingProviderPort } from '@akb/ai';
import { VectorSearchApplicationService } from './vector-search.application.service';
import { VectorSearchError } from '../domain/vector-search.port';
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

function makeRow(id: string, score: number): VectorSearchRow {
  return {
    chunkId: id,
    documentId: 'doc-1',
    documentVersionId: 'ver-1',
    knowledgeSpaceId: 'space-1',
    content: 'content',
    chunkIndex: 0,
    score,
    metadata: {},
    embeddingProvider: identity.provider,
    embeddingModel: identity.model,
    embeddingDimension: identity.dimension,
  };
}

function makeService(options?: {
  versionBelongs?: boolean;
  searchRows?: VectorSearchRow[];
  provider?: EmbeddingProviderPort;
  searchCalls?: VectorSearchParams[];
}) {
  const searchCalls = options?.searchCalls ?? [];
  const service = new VectorSearchApplicationService({
    authorization: {
      assertSpaceOwner: async () => ({ id: 'space-1' }) as never,
    },
    vectorSearch: {
      search: async (params) => {
        searchCalls.push(params);
        return options?.searchRows ?? [];
      },
      resolveCurrentVersionIds: async () => [],
      versionBelongsToSpace: async () => options?.versionBelongs ?? true,
    },
    embeddingProvider: options?.provider ?? makeProvider(),
  });
  return { service, searchCalls };
}

describe('VectorSearchApplicationService', () => {
  it('returns empty 200 contract payload for no hits', async () => {
    const { service, searchCalls } = makeService({ searchRows: [] });
    const result = await service.search('user-1', 'space-1', { query: 'jwt auth' });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.topK).toBe(10);
    expect(result.threshold).toBe(0.3);
    expect(result.versionId).toBeNull();
    expect(searchCalls[0]?.provider).toBe(identity.provider);
    expect(searchCalls[0]?.model).toBe(identity.model);
    expect(searchCalls[0]?.dimension).toBe(identity.dimension);
  });

  it('maps search params for explicit version and defaults', async () => {
    const { service, searchCalls } = makeService({
      versionBelongs: true,
      searchRows: [makeRow('chunk-b', 0.9), makeRow('chunk-a', 0.9)],
    });
    const result = await service.search('user-1', 'space-1', {
      query: 'jwt',
      topK: 5,
      threshold: 0,
      versionId: 'ver-explicit',
    });
    expect(result.versionId).toBe('ver-explicit');
    expect(result.topK).toBe(5);
    expect(result.threshold).toBe(0);
    expect(searchCalls[0]?.documentVersionId).toBe('ver-explicit');
    expect(result.items.map((i) => i.chunkId)).toEqual(['chunk-a', 'chunk-b']);
    expect(result.total).toBe(2);
  });

  it('rejects foreign version with 404', async () => {
    const { service } = makeService({ versionBelongs: false });
    await expect(
      service.search('user-1', 'space-1', { query: 'jwt', versionId: 'foreign' }),
    ).rejects.toMatchObject({ code: 'VECTOR_SEARCH_VERSION_NOT_FOUND', httpStatus: 404 });
  });

  it('rejects empty query', async () => {
    const { service } = makeService();
    await expect(service.search('user-1', 'space-1', { query: '   ' })).rejects.toBeInstanceOf(
      VectorSearchError,
    );
  });

  it('maps provider embedding failure to 500', async () => {
    const { service } = makeService({
      provider: makeProvider({
        embed: async () => {
          throw new EmbeddingError('EMBEDDING_PROVIDER_ERROR', 'provider down');
        },
      }),
    });
    await expect(service.search('user-1', 'space-1', { query: 'jwt' })).rejects.toMatchObject({
      code: 'VECTOR_SEARCH_EMBEDDING_ERROR',
      httpStatus: 500,
    });
  });
});
