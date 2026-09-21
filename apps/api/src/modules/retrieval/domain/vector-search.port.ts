export interface VectorSearchParams {
  knowledgeSpaceId: string;
  documentVersionId?: string | null;
  queryVector: number[];
  provider: string;
  model: string;
  dimension: number;
  topK: number;
  threshold: number;
}

export interface VectorSearchRow {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  content: string;
  chunkIndex: number;
  score: number;
  metadata: Record<string, unknown>;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimension: number;
}

export const VECTOR_SEARCH_REPOSITORY = Symbol('VECTOR_SEARCH_REPOSITORY');

export interface VectorSearchRepositoryPort {
  search(params: VectorSearchParams): Promise<VectorSearchRow[]>;
  resolveCurrentVersionIds(knowledgeSpaceId: string): Promise<string[]>;
  versionBelongsToSpace(versionId: string, knowledgeSpaceId: string): Promise<boolean>;
}

export const VECTOR_SEARCH_SERVICE = Symbol('VECTOR_SEARCH_SERVICE');

export interface VectorSearchRequest {
  knowledgeSpaceId: string;
  query: string;
  topK?: number;
  threshold?: number;
  versionId?: string;
}

export interface VectorSearchResultItem {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  content: string;
  chunkIndex: number;
  score: number;
  metadata: Record<string, unknown>;
  embedding: {
    provider: string;
    model: string;
    dimension: number;
  };
}

export interface VectorSearchResponse {
  knowledgeSpaceId: string;
  versionId: string | null;
  query: string;
  topK: number;
  threshold: number;
  provider: string;
  model: string;
  dimension: number;
  total: number;
  items: VectorSearchResultItem[];
}

export const DEFAULT_VECTOR_TOP_K = 10;
export const MAX_VECTOR_TOP_K = 50;
export const DEFAULT_VECTOR_THRESHOLD = 0.3;

export type VectorSearchErrorCode =
  | 'VECTOR_SEARCH_INVALID_QUERY'
  | 'VECTOR_SEARCH_INVALID_TOP_K'
  | 'VECTOR_SEARCH_INVALID_THRESHOLD'
  | 'VECTOR_SEARCH_VERSION_NOT_FOUND'
  | 'VECTOR_SEARCH_EMBEDDING_ERROR'
  | 'VECTOR_SEARCH_PROVIDER_ERROR';

export class VectorSearchError extends Error {
  constructor(
    readonly code: VectorSearchErrorCode,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'VectorSearchError';
  }
}

export function normalizeTopK(topK?: number): number {
  if (topK === undefined || topK === null || Number.isNaN(topK)) {
    return DEFAULT_VECTOR_TOP_K;
  }
  if (!Number.isInteger(topK) || topK < 1 || topK > MAX_VECTOR_TOP_K) {
    throw new VectorSearchError(
      'VECTOR_SEARCH_INVALID_TOP_K',
      `topK must be integer between 1 and ${MAX_VECTOR_TOP_K}`,
      400,
    );
  }
  return topK;
}

export function normalizeThreshold(threshold?: number): number {
  if (threshold === undefined || threshold === null || Number.isNaN(threshold)) {
    return DEFAULT_VECTOR_THRESHOLD;
  }
  if (typeof threshold !== 'number' || threshold < -1 || threshold > 1) {
    throw new VectorSearchError(
      'VECTOR_SEARCH_INVALID_THRESHOLD',
      'threshold must be between -1 and 1',
      400,
    );
  }
  return threshold;
}

export function validateSearchQuery(query: string): string {
  const trimmed = (query ?? '').trim();
  if (trimmed.length === 0) {
    throw new VectorSearchError('VECTOR_SEARCH_INVALID_QUERY', 'query must not be empty', 400);
  }
  return trimmed;
}

/** Cosine distance from pgvector `<=>`; score = 1 - cosine_distance. */
export function cosineScoreFromDistance(distance: number): number {
  return 1 - distance;
}

export function sortVectorSearchRows(rows: VectorSearchRow[]): VectorSearchRow[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });
}

/** Placeholder for future retrieval service contracts. */
export type VectorSearchServicePortLike = {
  search(input: unknown): Promise<unknown>;
};
