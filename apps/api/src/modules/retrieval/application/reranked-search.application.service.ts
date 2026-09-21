import type { EmbeddingProviderPort } from '@akb/ai';
import { EmbeddingError, normalizeEmbeddingText, validateEmbeddingVector } from '@akb/ai';
import type { AuthorizationService } from '../../shared/application/authorization.service';
import type { LexicalSearchRepositoryPort } from '../domain/lexical-search.port';
import { sortLexicalSearchRows } from '../domain/lexical-search.port';
import {
  fuseHybridCandidates,
  HybridSearchError,
  RRF_K,
  type HybridFusionCandidate,
} from '../domain/hybrid-search.port';
import {
  RerankerError,
  type RerankerProviderPort,
  type RerankInput,
} from '../domain/reranker.port';
import {
  normalizeFinalTopK,
  normalizeRerankedThreshold,
  normalizeRerankCandidateK,
  normalizeRetrievalCandidateK,
  RerankedSearchError,
  sortRerankedCandidates,
  validateRerankedQuery,
  type RankedRerankCandidate,
  type RerankedSearchRequest,
  type RerankedSearchResponse,
  type RerankedSearchResultItem,
} from '../domain/reranked-search.port';
import {
  sortVectorSearchRows,
  VectorSearchError,
  type VectorSearchRepositoryPort,
} from '../domain/vector-search.port';

export interface RerankedSearchServiceDeps {
  authorization: AuthorizationService;
  vectorSearch: VectorSearchRepositoryPort;
  lexicalSearch: LexicalSearchRepositoryPort;
  embeddingProvider: EmbeddingProviderPort;
  rerankerProvider: RerankerProviderPort;
}

export class RerankedSearchApplicationService {
  constructor(private readonly deps: RerankedSearchServiceDeps) {}

  async search(
    userId: string,
    spaceId: string,
    input: RerankedSearchRequest,
  ): Promise<RerankedSearchResponse> {
    const startedAt = Date.now();
    await this.deps.authorization.assertSpaceOwner(userId, spaceId);

    const query = validateRerankedQuery(input.query);
    const topK = normalizeFinalTopK(input.topK);
    const rerankCandidateK = normalizeRerankCandidateK(input.rerankCandidateK, topK);
    const retrievalCandidateK = normalizeRetrievalCandidateK(
      input.retrievalCandidateK,
      rerankCandidateK,
    );
    const threshold = normalizeRerankedThreshold(input.threshold);
    const identity = this.deps.embeddingProvider.identity();
    const dimension = identity.dimension;
    const rerankerIdentity = this.deps.rerankerProvider.identity();

    let versionId: string | null = null;
    if (input.versionId !== undefined && input.versionId !== '') {
      const belongs = await this.deps.vectorSearch.versionBelongsToSpace(input.versionId, spaceId);
      if (!belongs) {
        throw new RerankedSearchError(
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
      if (
        error instanceof RerankedSearchError ||
        error instanceof HybridSearchError ||
        error instanceof VectorSearchError
      ) {
        throw error;
      }
      if (error instanceof EmbeddingError) {
        throw new RerankedSearchError('VECTOR_SEARCH_EMBEDDING_ERROR', error.message, 500);
      }
      throw new RerankedSearchError('VECTOR_SEARCH_EMBEDDING_ERROR', 'query embedding failed', 500);
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
          topK: retrievalCandidateK,
          threshold,
        }),
        this.deps.lexicalSearch.search({
          knowledgeSpaceId: spaceId,
          documentVersionId: versionId,
          query,
          candidateK: retrievalCandidateK,
        }),
      ]);
    } catch (error) {
      if (
        error instanceof RerankedSearchError ||
        error instanceof HybridSearchError ||
        error instanceof VectorSearchError
      ) {
        throw error;
      }
      throw new RerankedSearchError('HYBRID_SEARCH_LEXICAL_ERROR', 'retrieval route failed', 500);
    }

    const orderedVector = sortVectorSearchRows(vectorRows);
    const orderedLexical = sortLexicalSearchRows(lexicalRows);
    const fused = sortHybridCandidatesFused(
      fuseHybridCandidates(orderedVector, orderedLexical, RRF_K),
    );
    const rerankPool = fused.slice(0, rerankCandidateK);

    if (rerankPool.length === 0) {
      console.log(
        JSON.stringify({
          event: 'reranked_search_stats',
          spaceId,
          versionId,
          embeddingProvider: identity.provider,
          embeddingModel: identity.model,
          dimension,
          rerankerProvider: rerankerIdentity.provider,
          rerankerModel: rerankerIdentity.model,
          topK,
          retrievalCandidateK,
          rerankCandidateK,
          threshold,
          vectorCandidateCount: orderedVector.length,
          lexicalCandidateCount: orderedLexical.length,
          rrfCandidateCount: fused.length,
          rerankInputCount: 0,
          finalResultCount: 0,
          durationMs: Date.now() - startedAt,
        }),
      );
      return {
        knowledgeSpaceId: spaceId,
        versionId,
        query,
        topK,
        retrievalCandidateK,
        rerankCandidateK,
        threshold,
        provider: rerankerIdentity.provider,
        model: rerankerIdentity.model,
        total: 0,
        items: [],
      };
    }

    const rerankInputs: RerankInput[] = rerankPool.map((row) => ({
      query,
      chunkId: row.chunkId,
      content: row.content,
    }));

    let rerankResults;
    try {
      rerankResults = await this.deps.rerankerProvider.rerank(rerankInputs);
    } catch (error) {
      if (error instanceof RerankerError) {
        if (error.code === 'RERANKER_INVALID_RESPONSE') {
          throw new RerankedSearchError('RERANKER_INVALID_RESPONSE', error.message, 500);
        }
        throw new RerankedSearchError('RERANKER_PROVIDER_ERROR', error.message, 500);
      }
      throw new RerankedSearchError('RERANKER_PROVIDER_ERROR', 'reranker provider failed', 500);
    }

    const scoreByChunk = new Map<string, number>();
    for (const result of rerankResults) {
      scoreByChunk.set(result.chunkId, result.score);
    }

    const ranked: RankedRerankCandidate[] = [];
    for (const row of rerankPool) {
      const score = scoreByChunk.get(row.chunkId);
      if (score === undefined || !Number.isFinite(score)) {
        throw new RerankedSearchError(
          'RERANKER_INVALID_RESPONSE',
          `missing or non-finite reranker score for chunk ${row.chunkId}`,
          500,
        );
      }
      ranked.push({ ...row, rerankerScore: score });
    }

    const finalRows = sortRerankedCandidates(ranked).slice(0, topK);
    const items: RerankedSearchResultItem[] = finalRows.map((row) => ({
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentVersionId: row.documentVersionId,
      knowledgeSpaceId: row.knowledgeSpaceId,
      content: row.content,
      score: row.rerankerScore,
      metadata: row.metadata,
    }));

    console.log(
      JSON.stringify({
        event: 'reranked_search_stats',
        spaceId,
        versionId,
        embeddingProvider: identity.provider,
        embeddingModel: identity.model,
        dimension,
        rerankerProvider: rerankerIdentity.provider,
        rerankerModel: rerankerIdentity.model,
        topK,
        retrievalCandidateK,
        rerankCandidateK,
        threshold,
        vectorCandidateCount: orderedVector.length,
        lexicalCandidateCount: orderedLexical.length,
        rrfCandidateCount: fused.length,
        rerankInputCount: rerankPool.length,
        finalResultCount: items.length,
        durationMs: Date.now() - startedAt,
      }),
    );

    return {
      knowledgeSpaceId: spaceId,
      versionId,
      query,
      topK,
      retrievalCandidateK,
      rerankCandidateK,
      threshold,
      provider: rerankerIdentity.provider,
      model: rerankerIdentity.model,
      total: items.length,
      items,
    };
  }
}

function sortHybridCandidatesFused(rows: HybridFusionCandidate[]): HybridFusionCandidate[] {
  return [...rows].sort((a, b) => {
    if (b.rrfScore !== a.rrfScore) {
      return b.rrfScore - a.rrfScore;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });
}
