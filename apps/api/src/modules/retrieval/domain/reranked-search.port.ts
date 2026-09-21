import {
  normalizeHybridThreshold,
  RRF_K,
  fuseHybridCandidates,
  sortHybridCandidates,
  validateHybridQuery,
  HybridSearchError,
  type HybridFusionCandidate,
} from './hybrid-search.port';
import { normalizeTopK } from './vector-search.port';

export const DEFAULT_FINAL_TOP_K = 10;
export const MAX_FINAL_TOP_K = 50;
export const DEFAULT_RETRIEVAL_CANDIDATE_K = 50;
export const MAX_RETRIEVAL_CANDIDATE_K = 100;
export const DEFAULT_RERANK_CANDIDATE_K = 20;
export const MAX_RERANK_CANDIDATE_K = 50;
export const DEFAULT_RERANK_THRESHOLD = 0.3;

export type RerankedSearchErrorCode =
  | 'INVALID_SEARCH_QUERY'
  | 'VECTOR_SEARCH_INVALID_TOP_K'
  | 'VECTOR_SEARCH_INVALID_THRESHOLD'
  | 'VECTOR_SEARCH_VERSION_NOT_FOUND'
  | 'VECTOR_SEARCH_EMBEDDING_ERROR'
  | 'HYBRID_SEARCH_LEXICAL_ERROR'
  | 'INVALID_RERANK_CANDIDATE_K'
  | 'RERANKER_PROVIDER_ERROR'
  | 'RERANKER_INVALID_RESPONSE';

export class RerankedSearchError extends Error {
  constructor(
    readonly code: RerankedSearchErrorCode,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'RerankedSearchError';
  }
}

export function validateRerankedQuery(query: string): string {
  const trimmed = (query ?? '').trim();
  if (trimmed.length === 0) {
    throw new RerankedSearchError('INVALID_SEARCH_QUERY', 'query must not be empty', 400);
  }
  return trimmed;
}

export function normalizeFinalTopK(topK?: number): number {
  if (topK === undefined || topK === null || Number.isNaN(topK)) {
    return DEFAULT_FINAL_TOP_K;
  }
  if (!Number.isInteger(topK) || topK < 1 || topK > MAX_FINAL_TOP_K) {
    throw new RerankedSearchError(
      'VECTOR_SEARCH_INVALID_TOP_K',
      `topK must be integer between 1 and ${MAX_FINAL_TOP_K}`,
      400,
    );
  }
  return topK;
}

export function normalizeRetrievalCandidateK(
  retrievalCandidateK: number | undefined,
  rerankCandidateK: number,
): number {
  let value = DEFAULT_RETRIEVAL_CANDIDATE_K;
  if (
    retrievalCandidateK !== undefined &&
    retrievalCandidateK !== null &&
    !Number.isNaN(retrievalCandidateK)
  ) {
    value = retrievalCandidateK;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_RETRIEVAL_CANDIDATE_K) {
    throw new RerankedSearchError(
      'INVALID_RERANK_CANDIDATE_K',
      `retrievalCandidateK must be integer between 1 and ${MAX_RETRIEVAL_CANDIDATE_K}`,
      400,
    );
  }
  if (value < rerankCandidateK) {
    throw new RerankedSearchError(
      'INVALID_RERANK_CANDIDATE_K',
      'retrievalCandidateK must be greater than or equal to rerankCandidateK',
      400,
    );
  }
  return value;
}

export function normalizeRerankCandidateK(
  rerankCandidateK: number | undefined,
  topK: number,
): number {
  let value = DEFAULT_RERANK_CANDIDATE_K;
  if (
    rerankCandidateK !== undefined &&
    rerankCandidateK !== null &&
    !Number.isNaN(rerankCandidateK)
  ) {
    value = rerankCandidateK;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_RERANK_CANDIDATE_K) {
    throw new RerankedSearchError(
      'INVALID_RERANK_CANDIDATE_K',
      `rerankCandidateK must be integer between 1 and ${MAX_RERANK_CANDIDATE_K}`,
      400,
    );
  }
  if (value < topK) {
    throw new RerankedSearchError(
      'INVALID_RERANK_CANDIDATE_K',
      'rerankCandidateK must be greater than or equal to topK',
      400,
    );
  }
  return value;
}

export function normalizeRerankedThreshold(threshold?: number): number {
  if (threshold === undefined || threshold === null || Number.isNaN(threshold)) {
    return DEFAULT_RERANK_THRESHOLD;
  }
  if (typeof threshold !== 'number' || threshold < -1 || threshold > 1) {
    throw new RerankedSearchError(
      'VECTOR_SEARCH_INVALID_THRESHOLD',
      'threshold must be between -1 and 1',
      400,
    );
  }
  return threshold;
}

export interface RerankedSearchRequest {
  query: string;
  topK?: number;
  retrievalCandidateK?: number;
  rerankCandidateK?: number;
  threshold?: number;
  versionId?: string;
}

export interface RerankedSearchResultItem {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RerankedSearchResponse {
  knowledgeSpaceId: string;
  versionId: string | null;
  query: string;
  topK: number;
  retrievalCandidateK: number;
  rerankCandidateK: number;
  threshold: number;
  provider: string;
  model: string;
  total: number;
  items: RerankedSearchResultItem[];
}

export interface RankedRerankCandidate extends HybridFusionCandidate {
  rerankerScore: number;
}

export function sortRerankedCandidates(rows: RankedRerankCandidate[]): RankedRerankCandidate[] {
  return [...rows].sort((a, b) => {
    if (b.rerankerScore !== a.rerankerScore) {
      return b.rerankerScore - a.rerankerScore;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });
}

export {
  RRF_K,
  fuseHybridCandidates,
  sortHybridCandidates,
  validateHybridQuery,
  HybridSearchError,
  normalizeHybridThreshold,
  normalizeTopK,
};
