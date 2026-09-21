import type { EmbeddingProviderPort } from '@akb/ai';
import { EmbeddingError, normalizeEmbeddingText, validateEmbeddingVector } from '@akb/ai';
import type { AuthorizationService } from '../../shared/application/authorization.service';
import type { LexicalSearchRepositoryPort } from '../domain/lexical-search.port';
import { sortLexicalSearchRows } from '../domain/lexical-search.port';
import {
  fuseHybridCandidates,
  HybridSearchError,
  normalizeCandidateK,
  normalizeHybridThreshold,
  normalizeHybridTopK,
  RRF_K,
  validateHybridQuery,
  type HybridSearchRequest,
  type HybridSearchResponse,
  type HybridSearchResultItem,
} from '../domain/hybrid-search.port';
import {
  sortVectorSearchRows,
  VectorSearchError,
  type VectorSearchRepositoryPort,
} from '../domain/vector-search.port';

export interface HybridSearchServiceDeps {
  authorization: AuthorizationService;
  vectorSearch: VectorSearchRepositoryPort;
  lexicalSearch: LexicalSearchRepositoryPort;
  embeddingProvider: EmbeddingProviderPort;
}

export class HybridSearchApplicationService {
  constructor(private readonly deps: HybridSearchServiceDeps) {}

  async search(
    userId: string,
    spaceId: string,
    input: HybridSearchRequest,
  ): Promise<HybridSearchResponse> {
    const startedAt = Date.now();
    await this.deps.authorization.assertSpaceOwner(userId, spaceId);

    const query = validateHybridQuery(input.query);
    const topK = normalizeHybridTopK(input.topK);
    const candidateK = normalizeCandidateK(input.candidateK, topK);
    const threshold = normalizeHybridThreshold(input.threshold);
    const identity = this.deps.embeddingProvider.identity();
    const dimension = identity.dimension;

    let versionId: string | null = null;
    if (input.versionId !== undefined && input.versionId !== '') {
      const belongs = await this.deps.vectorSearch.versionBelongsToSpace(input.versionId, spaceId);
      if (!belongs) {
        throw new HybridSearchError(
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
      if (error instanceof HybridSearchError || error instanceof VectorSearchError) {
        throw error;
      }
      if (error instanceof EmbeddingError) {
        throw new HybridSearchError('VECTOR_SEARCH_EMBEDDING_ERROR', error.message, 500);
      }
      throw new HybridSearchError('VECTOR_SEARCH_EMBEDDING_ERROR', 'query embedding failed', 500);
    }

    let vectorRows;
    let lexicalRows;
    try {
      [vectorRows, lexicalRows] = await Promise.all([
        this.deps.vectorSearch.search({
          knowledgeSpaceId: spaceId,
          documentVersionId: versionId,
          queryVector,
          provider: identity.provider,
          model: identity.model,
          dimension,
          topK: candidateK,
          threshold,
        }),
        this.deps.lexicalSearch.search({
          knowledgeSpaceId: spaceId,
          documentVersionId: versionId,
          query,
          candidateK,
        }),
      ]);
    } catch (error) {
      if (error instanceof HybridSearchError || error instanceof VectorSearchError) {
        throw error;
      }
      throw new HybridSearchError(
        'HYBRID_SEARCH_LEXICAL_ERROR',
        'hybrid retrieval route failed',
        500,
      );
    }

    const orderedVector = sortVectorSearchRows(vectorRows);
    const orderedLexical = sortLexicalSearchRows(lexicalRows);
    const fused = fuseHybridCandidates(orderedVector, orderedLexical, RRF_K);
    const limited = fused.slice(0, topK);

    const items: HybridSearchResultItem[] = limited.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
      knowledgeSpaceId: row.knowledgeSpaceId,
      content: row.content,
      score: row.rrfScore,
      metadata: row.metadata,
    }));

    // Observability: no raw query logged.
    console.log(
      JSON.stringify({
        event: 'hybrid_search_stats',
        spaceId,
        versionId,
        embeddingProvider: identity.provider,
        embeddingModel: identity.model,
        dimension,
        topK,
        candidateK,
        threshold,
        vectorCandidateCount: orderedVector.length,
        lexicalCandidateCount: orderedLexical.length,
        finalResultCount: items.length,
        durationMs: Date.now() - startedAt,
      }),
    );

    return {
      knowledgeSpaceId: spaceId,
      versionId,
      query,
      topK,
      candidateK,
      threshold,
      total: items.length,
      items,
    };
  }
}
