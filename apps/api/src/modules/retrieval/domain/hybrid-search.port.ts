import {
  normalizeThreshold,
  normalizeTopK,
  validateSearchQuery,
  VectorSearchError,
  type VectorSearchRow,
} from './vector-search.port';
import type { LexicalSearchRow } from './lexical-search.port';

export const DEFAULT_HYBRID_TOP_K = 10;
export const MAX_HYBRID_TOP_K = 50;
export const DEFAULT_HYBRID_CANDIDATE_K = 50;
export const MAX_HYBRID_CANDIDATE_K = 100;
export const DEFAULT_HYBRID_THRESHOLD = 0.3;
export const RRF_K = 60;

export type HybridSearchErrorCode =
  | 'VECTOR_SEARCH_INVALID_QUERY'
  | 'VECTOR_SEARCH_INVALID_TOP_K'
  | 'VECTOR_SEARCH_INVALID_THRESHOLD'
  | 'VECTOR_SEARCH_VERSION_NOT_FOUND'
  | 'VECTOR_SEARCH_EMBEDDING_ERROR'
  | 'INVALID_SEARCH_CANDIDATE_K'
  | 'HYBRID_SEARCH_LEXICAL_ERROR';

export class HybridSearchError extends Error {
  constructor(
    readonly code: HybridSearchErrorCode,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'HybridSearchError';
  }
}

export function normalizeHybridTopK(topK?: number): number {
  if (topK === undefined || topK === null || Number.isNaN(topK)) {
    return DEFAULT_HYBRID_TOP_K;
  }
  if (!Number.isInteger(topK) || topK < 1 || topK > MAX_HYBRID_TOP_K) {
    throw new HybridSearchError(
      'VECTOR_SEARCH_INVALID_TOP_K',
      `topK must be integer between 1 and ${MAX_HYBRID_TOP_K}`,
      400,
    );
  }
  return topK;
}

export function normalizeCandidateK(candidateK: number | undefined, topK: number): number {
  let value = DEFAULT_HYBRID_CANDIDATE_K;
  if (candidateK !== undefined && candidateK !== null && !Number.isNaN(candidateK)) {
    value = candidateK;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_HYBRID_CANDIDATE_K) {
    throw new HybridSearchError(
      'INVALID_SEARCH_CANDIDATE_K',
      `candidateK must be integer between 1 and ${MAX_HYBRID_CANDIDATE_K}`,
      400,
    );
  }
  if (value < topK) {
    throw new HybridSearchError(
      'INVALID_SEARCH_CANDIDATE_K',
      'candidateK must be greater than or equal to topK',
      400,
    );
  }
  return value;
}

export function normalizeHybridThreshold(threshold?: number): number {
  if (threshold === undefined || threshold === null || Number.isNaN(threshold)) {
    return DEFAULT_HYBRID_THRESHOLD;
  }
  if (typeof threshold !== 'number' || threshold < -1 || threshold > 1) {
    throw new HybridSearchError(
      'VECTOR_SEARCH_INVALID_THRESHOLD',
      'threshold must be between -1 and 1',
      400,
    );
  }
  return threshold;
}

export function validateHybridQuery(query: string): string {
  const trimmed = (query ?? '').trim();
  if (trimmed.length === 0) {
    throw new HybridSearchError('VECTOR_SEARCH_INVALID_QUERY', 'query must not be empty', 400);
  }
  return trimmed;
}

/** RRFScore = Σ 1 / (rrfK + rank), rank starts at 1. */
export function rrfContribution(rank: number, rrfK: number = RRF_K): number {
  return 1 / (rrfK + rank);
}

export interface HybridFusionCandidate {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  content: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  vectorRank: number | null;
  lexicalRank: number | null;
  vectorScore: number | null;
  lexicalScore: number | null;
  rrfScore: number;
}

export function sortHybridCandidates(rows: HybridFusionCandidate[]): HybridFusionCandidate[] {
  return [...rows].sort((a, b) => {
    if (b.rrfScore !== a.rrfScore) {
      return b.rrfScore - a.rrfScore;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });
}

/**
 * Fuse vector + lexical candidates with standard RRF.
 * Dedup key is chunkId; dual-route hits sum both contributions.
 * Input order defines rank (1-based); callers must pre-sort each route deterministically.
 */
export function fuseHybridCandidates(
  vectorRows: VectorSearchRow[],
  lexicalRows: LexicalSearchRow[],
  rrfK: number = RRF_K,
): HybridFusionCandidate[] {
  const map = new Map<string, HybridFusionCandidate>();

  vectorRows.forEach((row, index) => {
    const rank = index + 1;
    const contribution = rrfContribution(rank, rrfK);
    const existing = map.get(row.chunkId);
    if (existing) {
      existing.rrfScore += contribution;
      existing.vectorRank = rank;
      existing.vectorScore = row.score;
    } else {
      map.set(row.chunkId, {
        chunkId: row.chunkId,
        documentId: row.documentId,
        documentVersionId: row.documentVersionId,
        knowledgeSpaceId: row.knowledgeSpaceId,
        content: row.content,
        chunkIndex: row.chunkIndex,
        metadata: row.metadata ?? {},
        vectorRank: rank,
        lexicalRank: null,
        vectorScore: row.score,
        lexicalScore: null,
        rrfScore: contribution,
      });
    }
  });

  lexicalRows.forEach((row, index) => {
    const rank = index + 1;
    const contribution = rrfContribution(rank, rrfK);
    const existing = map.get(row.chunkId);
    if (existing) {
      existing.rrfScore += contribution;
      existing.lexicalRank = rank;
      existing.lexicalScore = row.score;
    } else {
      map.set(row.chunkId, {
        chunkId: row.chunkId,
        documentId: row.documentId,
        documentVersionId: row.documentVersionId,
        knowledgeSpaceId: row.knowledgeSpaceId,
        content: row.content,
        chunkIndex: row.chunkIndex,
        metadata: row.metadata ?? {},
        vectorRank: null,
        lexicalRank: rank,
        vectorScore: null,
        lexicalScore: row.score,
        rrfScore: contribution,
      });
    }
  });

  return sortHybridCandidates([...map.values()]);
}

export interface HybridSearchRequest {
  query: string;
  topK?: number;
  candidateK?: number;
  threshold?: number;
  versionId?: string;
}

export interface HybridSearchResultItem {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface HybridSearchResponse {
  knowledgeSpaceId: string;
  versionId: string | null;
  query: string;
  topK: number;
  candidateK: number;
  threshold: number;
  total: number;
  items: HybridSearchResultItem[];
}

export { normalizeThreshold, normalizeTopK, validateSearchQuery, VectorSearchError };
