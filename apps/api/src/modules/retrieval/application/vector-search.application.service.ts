import type { EmbeddingModelConfig, EmbeddingProviderPort } from '@akb/ai';
import {
  EmbeddingError,
  loadEmbeddingConfig,
  MockEmbeddingProvider,
  normalizeEmbeddingText,
  validateEmbeddingVector,
} from '@akb/ai';
import type { AuthorizationService } from '../../shared/application/authorization.service';
import {
  normalizeThreshold,
  normalizeTopK,
  sortVectorSearchRows,
  validateSearchQuery,
  VectorSearchError,
  type VectorSearchRepositoryPort,
  type VectorSearchResponse,
  type VectorSearchResultItem,
} from '../domain/vector-search.port';

export interface VectorSearchServiceDeps {
  authorization: AuthorizationService;
  vectorSearch: VectorSearchRepositoryPort;
  embeddingProvider: EmbeddingProviderPort;
  embeddingConfig: EmbeddingModelConfig;
}

export class VectorSearchApplicationService {
  constructor(private readonly deps: VectorSearchServiceDeps) {}

  static createDefault(
    authorization: AuthorizationService,
    vectorSearch: VectorSearchRepositoryPort,
  ): VectorSearchApplicationService {
    const embeddingConfig = loadEmbeddingConfig(process.env);
    return new VectorSearchApplicationService({
      authorization,
      vectorSearch,
      embeddingProvider: new MockEmbeddingProvider(embeddingConfig),
      embeddingConfig,
    });
  }

  async search(
    userId: string,
    spaceId: string,
    input: { query: string; topK?: number; threshold?: number; versionId?: string },
  ): Promise<VectorSearchResponse> {
    await this.deps.authorization.assertSpaceOwner(userId, spaceId);

    const query = validateSearchQuery(input.query);
    const topK = normalizeTopK(input.topK);
    const threshold = normalizeThreshold(input.threshold);
    const identity = this.deps.embeddingProvider.identity();
    const dimension = this.deps.embeddingConfig.dimension;

    let versionId: string | null = null;
    if (input.versionId !== undefined && input.versionId !== '') {
      const belongs = await this.deps.vectorSearch.versionBelongsToSpace(input.versionId, spaceId);
      if (!belongs) {
        throw new VectorSearchError(
          'VECTOR_SEARCH_VERSION_NOT_FOUND',
          'version not found in knowledge space',
          404,
        );
      }
      versionId = input.versionId;
    }

    const text = normalizeEmbeddingText(query);
    let queryVector: number[];
    try {
      const embedded = await this.deps.embeddingProvider.embed({ text });
      validateEmbeddingVector(embedded.vector, dimension);
      queryVector = embedded.vector;
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw new VectorSearchError('VECTOR_SEARCH_EMBEDDING_ERROR', error.message, 500);
      }
      if (error instanceof VectorSearchError) {
        throw error;
      }
      throw new VectorSearchError('VECTOR_SEARCH_EMBEDDING_ERROR', 'query embedding failed', 500);
    }

    const rawRows = await this.deps.vectorSearch.search({
      knowledgeSpaceId: spaceId,
      documentVersionId: versionId,
      queryVector,
      provider: identity.provider,
      model: identity.model,
      dimension,
      topK,
      threshold,
    });

    const ordered = sortVectorSearchRows(rawRows).slice(0, topK);
    const items: VectorSearchResultItem[] = ordered.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
      knowledgeSpaceId: row.knowledgeSpaceId,
      content: row.content,
      chunkIndex: row.chunkIndex,
      score: row.score,
      metadata: row.metadata,
      embedding: {
        provider: row.embeddingProvider,
        model: row.embeddingModel,
        dimension: row.embeddingDimension,
      },
    }));

    return {
      knowledgeSpaceId: spaceId,
      versionId,
      query,
      topK,
      threshold,
      provider: identity.provider,
      model: identity.model,
      dimension,
      total: items.length,
      items,
    };
  }
}
